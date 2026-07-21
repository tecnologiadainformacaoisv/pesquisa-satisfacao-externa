# =====================================================================
#  ISV — Pesquisa de Satisfacao : iniciar o app
#  Uso: clique direito > "Executar com o PowerShell"  ou  .\iniciar.ps1
#
#  O Supabase (banco na nuvem) esta SEMPRE no ar — nada a reiniciar la.
#  Um so app agora: a tela inicial pergunta "admin ou totem" e manda pra
#  tela certa (ver app/src/App.jsx). So aparece 1x por aparelho/navegador.
# =====================================================================

$ErrorActionPreference = 'Stop'

$app = Join-Path $PSScriptRoot 'app'

Write-Host ''
Write-Host '  Instituto Sao Vicente - Pesquisa de Satisfacao' -ForegroundColor Cyan
Write-Host '  ----------------------------------------------' -ForegroundColor DarkGray

if (-not (Test-Path (Join-Path $app 'node_modules'))) {
  Write-Host '  instalando dependencias (1-2 min)...' -ForegroundColor Yellow
  Push-Location $app; npm install; Pop-Location
}

Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$app'; npm run dev"

Write-Host '  Aguardando o servidor subir...' -ForegroundColor DarkGray
Start-Sleep -Seconds 4

Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host '  App: http://localhost:5173' -ForegroundColor Green
Write-Host ''
Write-Host '  Feche a janela do PowerShell aberta para parar o servidor.' -ForegroundColor DarkGray
