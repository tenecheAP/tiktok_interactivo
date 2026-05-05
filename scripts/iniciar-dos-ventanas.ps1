# Abre DOS ventanas de PowerShell: backend (3000) y frontend (5173)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

Write-Host 'Abriendo terminal 1: backend en puerto 3000...'
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$backend'; if (-not (Test-Path 'node_modules')) { npm install }; Write-Host 'Backend http://localhost:3000'; npm start"
)

Start-Sleep -Seconds 2

Write-Host 'Abriendo terminal 2: frontend en puerto 5173...'
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$frontend'; if (-not (Test-Path 'node_modules')) { npm install }; Write-Host 'Frontend http://localhost:5173'; npm run dev"
)

Write-Host 'Listo. Usa el navegador en: http://localhost:5173'
