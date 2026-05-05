# Backend TikTok + Socket.IO (puerto 3000 por defecto)
# Los mensajes de consola también se guardan en logs/backend.log (desde Node).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root 'backend'
Set-Location $backendDir
Write-Host 'Iniciando backend en http://localhost:3000'
Write-Host 'Archivo de log adicional: ../logs/backend.log'
npm run start
