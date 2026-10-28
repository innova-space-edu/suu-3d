param([switch]$InstallPython, [switch]$CheckOllamaOnly)
$ErrorActionPreference = 'Stop'
$address = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST.Trim() } else { '127.0.0.1:11434' }
if ($address -notmatch '://') { $address = 'http://' + $address }
$uri = [uri]$address
if ($uri.Scheme -ne 'http' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
  throw 'OLLAMA_HOST debe ser HTTP local o Tailscale sin ruta ni credenciales.'
}
if ($uri.Host -ne 'localhost') {
  $ip = [System.Net.IPAddress]::Parse($uri.DnsSafeHost)
  $bytes = $ip.GetAddressBytes()
  $isTailscale = $bytes.Length -eq 4 -and $bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127
  if (-not [System.Net.IPAddress]::IsLoopback($ip) -and -not $isTailscale) { throw 'El ensayo solo admite loopback o IP Tailscale.' }
}
# An omitted port uses Ollama's default, including when a scheme was supplied.
$port = 11434
if ($address -match ':(\d+)/?$') { $port = [int]$Matches[1] }
$hostText = if ($uri.DnsSafeHost.Contains(':')) { '[' + $uri.DnsSafeHost + ']' } else { $uri.DnsSafeHost }
$base = 'http://' + $hostText + ':' + $port
$env:OLLAMA_HOST = $base
Write-Host ('API Ollama del ensayo: ' + $base)
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'Falta curl.exe para comprobar la API.' }
$savedErrorAction = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $healthOutput = & curl.exe --noproxy '*' --fail --silent --show-error --connect-timeout 5 --max-time 10 ($base + '/api/version') 2>&1
  $healthExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $savedErrorAction }
if ($healthExit -ne 0) { throw ('Ollama: curl.exe codigo ' + $healthExit + ' en ' + $base + ': ' + ($healthOutput -join ' ')) }
try { $health = ($healthOutput -join "`n") | ConvertFrom-Json }
catch { throw ('La API en ' + $base + ' no devolvio JSON de version valido.') }
if (-not $health.version) { throw ('La API en ' + $base + ' no devolvio version de Ollama.') }
Write-Host ('Ollama responde. Version: ' + $health.version)
if ($CheckOllamaOnly) { return }
$trialDir = Join-Path $env:LOCALAPPDATA 'SUU\victus-trial'
New-Item -ItemType Directory -Force -Path $trialDir | Out-Null
$pythonCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'),
  'C:\Program Files\Python311\python.exe'
)
$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $python) {
  if (-not $InstallPython) { throw 'No hay Python 3.11 real. Repite con -InstallPython para instalarlo mediante winget.' }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Falta winget. Instala Python 3.11 x64 desde python.org y repite.' }
  & winget install --id Python.Python.3.11 --exact --scope user --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar Python 3.11.' }
  $python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $python) { throw 'No se encontro Python311. Abre otra consola y revisa la instalacion.' }
}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw 'Falta Ollama en PATH.' }
$osInfo = Get-CimInstance Win32_OperatingSystem
if ($osInfo.FreePhysicalMemory -lt 3GB / 1KB) { throw 'Menos de 3 GiB de RAM disponibles. Cierra otras aplicaciones y repite.' }
$gpuInfo = & nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar la GPU NVIDIA.' }
$hardware = @{
  cpu = Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
  ram_free_gib = [math]::Round($osInfo.FreePhysicalMemory / 1MB, 2)
  gpu = $gpuInfo
}
$hardware | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $trialDir 'hardware.json')
$hardware | ConvertTo-Json -Depth 5 | Write-Host
$venvPython = Join-Path $trialDir 'venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  & $python -m venv (Join-Path $trialDir 'venv')
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno aislado.' }
}
& $venvPython -m pip install --disable-pip-version-check 'piper-tts==1.8.0' 'onnxruntime==1.23.2'
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias de voz.' }
$files = @(
  @{ name = 'benchmark.py'; path = 'deploy/victus/benchmark.py'; sha = 'ec71a15fce50f4cb7d93f28cf8e4c604ccdbcd10f0fad854cfee5fb00208f9d9' },
  @{ name = 'benchmark-quality.py'; path = 'deploy/dell-ai/admin/benchmark-quality.py'; sha = '7eb8b775ada8ffbd84a20b6d16189e75482c383811d3648168cfc0d260ed86f4' },
  @{ name = 'speech-probe.py'; path = 'deploy/dell-ai/admin/speech-probe.py'; sha = '4a2448d90bd91c0431ba71d99b2097aff4859e2da88851f76923af926fe6bf56' }
)
foreach ($file in $files) {
  $destination = Join-Path $trialDir $file.name
  $temporary = $destination + '.download'
  try {
    Invoke-WebRequest -UseBasicParsing -Uri ('https://raw.githubusercontent.com/innova-space-edu/suu-3d/main/' + $file.path) -OutFile $temporary
    if ((Get-FileHash -Algorithm SHA256 $temporary).Hash.ToLowerInvariant() -ne $file.sha) { throw ('SHA incorrecto: ' + $file.name + '. Descarga otra vez el setup actualizado.') }
    Move-Item -Force $temporary $destination
  } finally { Remove-Item -Force -ErrorAction SilentlyContinue $temporary }
}
$env:PYTHONUTF8 = '1'
& $venvPython (Join-Path $trialDir 'benchmark.py')
if ($LASTEXITCODE -ne 0) { throw 'El ensayo no termino. Copia el error; no se modifica SUU.' }
Write-Host ('Audios e informe en: ' + (Join-Path $trialDir 'data'))
