# Frontend con copia de consola a logs/frontend-consola.log (PowerShell 5+)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir 'frontend-consola.log'
$frontendDir = Join-Path $root 'frontend'
Set-Location $frontendDir
Write-Host "Consola + archivo: $logFile"
npm run dev 2>&1 | Tee-Object -FilePath $logFile
