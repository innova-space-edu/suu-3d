$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'enable-remote.ps1'
$tokens = $null
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
$parameters = @{
  DellIP='100.90.202.99'; VictusIP='100.98.233.4'; WindowsUser='34'
  PublicKey='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA synthetic-test'
  RenderOnly=$true
}
$config = & $script @parameters
if ($config -notmatch 'AllowUsers 34@100\.90\.202\.99') { throw 'Dell/account restriction missing' }
if ($config -notmatch 'AuthenticationMethods publickey' -or $config -notmatch 'PasswordAuthentication no') { throw 'Key-only authentication missing' }
if ($config -notmatch 'authorized_keys_34') { throw 'Individual key path missing' }
$parameters.DellIP = '192.168.1.1'
try { & $script @parameters; throw 'Expected address rejection' }
catch { if ($_.Exception.Message -notmatch 'Tailscale') { throw } }
$parameters.DellIP = '100.90.202.99'
$parameters.PublicKey = "ssh-ed25519 AAAA`nPasswordAuthentication yes"
try { & $script @parameters; throw 'Expected key rejection' }
catch { if ($_.Exception.Message -notmatch 'Ed25519') { throw } }
