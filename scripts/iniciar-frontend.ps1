# Frontend Vite (puerto 5173 por defecto)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $root 'frontend'
Set-Location $frontendDir
Write-Host 'Iniciando frontend en http://localhost:5173'
npm run dev
