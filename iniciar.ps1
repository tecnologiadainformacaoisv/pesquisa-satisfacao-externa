# =====================================================================
#  ISV — Pesquisa de Satisfacao : iniciar o app de coleta (segunda-feira)
#  Uso: clique direito neste arquivo > "Executar com o PowerShell"
#       ou, no terminal:  .\iniciar.ps1
#
#  O Supabase (banco na nuvem) esta SEMPRE no ar — nada a reiniciar la.
#  Este script sobe apenas o app local (Vite) em http://localhost:5173
# =====================================================================

$ErrorActionPreference = 'Stop'
$app = Join-Path $PSScriptRoot 'app'

Write-Host ''
Write-Host '  Instituto Sao Vicente - App de Coleta' -ForegroundColor Cyan
Write-Host '  --------------------------------------' -ForegroundColor DarkGray

if (-not (Test-Path (Join-Path $app 'node_modules'))) {
  Write-Host '  Primeira vez: instalando dependencias (pode demorar 1-2 min)...' -ForegroundColor Yellow
  Push-Location $app
  npm install
  Pop-Location
}

Write-Host '  Abrindo http://localhost:5173 no navegador...' -ForegroundColor Green
Start-Process 'http://localhost:5173'

Write-Host '  Servidor rodando. Feche esta janela (ou Ctrl+C) para parar.' -ForegroundColor DarkGray
Write-Host ''

Push-Location $app
npm run dev
Pop-Location
