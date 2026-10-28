$ErrorActionPreference = 'Stop'
$setupPath = Join-Path $PSScriptRoot 'setup.ps1'
$tokens = $null
$parseErrors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($setupPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
$originalHostValue = $env:OLLAMA_HOST
try {
  function global:curl.exe {
    $global:LASTEXITCODE = 0
    if ($args -notcontains '--noproxy' -or $args[-1] -ne 'http://100.98.233.4:11434/api/version') { throw 'Unexpected curl arguments' }
    '{"version":"synthetic-test"}'
  }
  $env:OLLAMA_HOST = '100.98.233.4:11434'
  & $setupPath -CheckOllamaOnly -TextOnly
  if ($env:OLLAMA_HOST -ne 'http://100.98.233.4:11434') { throw 'Host normalization failed' }
  function global:curl.exe {
    $global:LASTEXITCODE = 7
    'synthetic connection refused'
  }
  try {
    & $setupPath -CheckOllamaOnly -TextOnly
    throw 'Expected curl failure'
  } catch {
    if ($_.Exception.Message -notmatch 'codigo 7.*synthetic connection refused') { throw }
  }
  function global:curl.exe {
    $global:LASTEXITCODE = 0
    'invalid-json'
  }
  try {
    & $setupPath -CheckOllamaOnly -TextOnly
    throw 'Expected parse failure'
  } catch {
    if ($_.Exception.Message -notmatch 'JSON') { throw }
  }
} finally {
  Remove-Item Function:\curl.exe -ErrorAction SilentlyContinue
  $env:OLLAMA_HOST = $originalHostValue
}
