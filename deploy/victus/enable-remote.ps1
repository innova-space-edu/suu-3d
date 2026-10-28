param(
  [Parameter(Mandatory=$true)][string]$DellIP,
  [Parameter(Mandatory=$true)][string]$VictusIP,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9_-]+$')][string]$WindowsUser,
  [Parameter(Mandatory=$true)][string]$PublicKey,
  [switch]$RenderOnly
)
$ErrorActionPreference = 'Stop'
foreach ($address in @($DellIP,$VictusIP)) {
  $ip = [System.Net.IPAddress]::Parse($address)
  $bytes = $ip.GetAddressBytes()
  if ($bytes.Length -ne 4 -or $bytes[0] -ne 100 -or $bytes[1] -lt 64 -or $bytes[1] -gt 127) {
    throw 'Se requieren direcciones IPv4 de Tailscale.'
  }
}
if ($PublicKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/]+={0,2}( [^\r\n]*)?$') { throw 'Clave publica Ed25519 no valida.' }
$sshDir = Join-Path $env:ProgramData 'ssh'
$managedDir = Join-Path $env:ProgramData 'SUU\remote-management'
$keyFile = Join-Path $managedDir ('authorized_keys_' + $WindowsUser)
$keyPathConfig = $keyFile.Replace('\','/')
$configText = @"
# SUU managed SSH v1; only the named Dell/user may authenticate.
Port 22
ListenAddress 0.0.0.0
PubkeyAuthentication yes
PasswordAuthentication no
AuthenticationMethods publickey
AllowUsers $WindowsUser@$DellIP
AuthorizedKeysFile "$keyPathConfig"
StrictModes yes
Subsystem sftp sftp-server.exe
"@
if ($RenderOnly) { $configText; return }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Ejecutar una vez en PowerShell como administrador del Victus.'
}
$user = Get-LocalUser -Name $WindowsUser -ErrorAction Stop
if (-not $user.Enabled) { throw 'La cuenta de Windows esta deshabilitada.' }
$actualIP = (& tailscale ip -4 | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or $actualIP -ne $VictusIP) { throw 'La IP Tailscale de este equipo no coincide con VictusIP.' }
# Refuse to replace an unrelated custom SSH deployment.
$configFile = Join-Path $sshDir 'sshd_config'
$defaultFile = Join-Path $env:WINDIR 'System32\OpenSSH\sshd_config_default'
if (Test-Path $configFile) {
  $existing = [IO.File]::ReadAllText($configFile)
  $stock = if (Test-Path $defaultFile) { [IO.File]::ReadAllText($defaultFile) } else { '' }
  if (-not $existing.StartsWith('# SUU managed SSH v1;') -and $existing.Trim() -ne $stock.Trim()) {
    throw 'Existe una configuracion SSH personalizada. Se conserva; revisar antes de migrar.'
  }
}
$capability = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
if ($capability.State -ne 'Installed') {
  $installation = Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
  if ($installation.RestartNeeded) { throw 'Windows solicita reinicio para completar OpenSSH. Reinicia y repite.' }
}
New-Item -ItemType Directory -Force -Path $sshDir,$managedDir | Out-Null
& icacls.exe $managedDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' ('*' + $user.SID.Value + ':(OI)(CI)RX') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron configurar permisos de la carpeta SSH SUU.' }
$backupDir = Join-Path $managedDir ('backup-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))
New-Item -ItemType Directory -Path $backupDir | Out-Null
if (Test-Path $configFile) { Copy-Item $configFile (Join-Path $backupDir 'sshd_config') }
if (Test-Path $keyFile) { Copy-Item $keyFile (Join-Path $backupDir 'authorized_keys') }
[IO.File]::WriteAllText($keyFile, $PublicKey.Trim() + "`n", [Text.Encoding]::ASCII)
& icacls.exe $keyFile /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' ('*' + $user.SID.Value + ':R') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron configurar permisos de la clave publica.' }
$sshd = Join-Path $env:WINDIR 'System32\OpenSSH\sshd.exe'
$keygen = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe'
& $keygen -A
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar las claves del anfitrion.' }
$candidateFile = Join-Path $sshDir 'sshd_config.suu-candidate'
[IO.File]::WriteAllText($candidateFile, $configText + "`n", [Text.Encoding]::ASCII)
try {
  & $sshd -t -f $candidateFile
  if ($LASTEXITCODE -ne 0) { throw 'OpenSSH rechazo la configuracion candidata. No se reemplazo sshd_config.' }
  Copy-Item $candidateFile $configFile -Force
} finally { Remove-Item $candidateFile -ErrorAction SilentlyContinue }
# Scope the standard OpenSSH rule to the private Dell instead of opening to LAN/public.
$ruleName = 'OpenSSH-Server-In-TCP'
$oldRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($oldRule) {
  $oldRule | Get-NetFirewallAddressFilter | Select-Object LocalAddress,RemoteAddress |
    ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $backupDir 'firewall-addresses.json')
  $oldRule | Set-NetFirewallRule -Enabled True -Profile Any -LocalAddress $VictusIP -RemoteAddress $DellIP
} else {
  New-NetFirewallRule -Name $ruleName -DisplayName 'OpenSSH SUU desde Dell Tailscale' -Enabled True `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 -LocalAddress $VictusIP -RemoteAddress $DellIP -Profile Any | Out-Null
}
Set-Service sshd -StartupType Automatic
Start-Service sshd
Restart-Service sshd
Write-Host ('Respaldo: ' + $backupDir)
Write-Host 'Huella del anfitrion Victus: comparar al conectar desde Dell.'
& $keygen -lf (Join-Path $sshDir 'ssh_host_ed25519_key.pub')
Write-Host ('SSH preparado: ' + $WindowsUser + '@' + $VictusIP + ', origen autorizado: ' + $DellIP)
Write-Host 'Todavia no modifica Ollama, energia, modelos ni MCP. Verificar SSH antes del arranque automatico de IA.'
