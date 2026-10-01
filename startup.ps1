$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try {
  $response = Invoke-WebRequest 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 2
  if ($response.StatusCode -eq 200) { exit 0 }
} catch {}
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
