$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js LTS first." }
npm install
npm run make:win
Write-Host "Installer output is under .\out\make\squirrel.windows\x64" -ForegroundColor Green
