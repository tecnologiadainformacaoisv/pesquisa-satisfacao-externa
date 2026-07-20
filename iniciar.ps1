# =====================================================================
#  ISV — Pesquisa de Satisfacao : iniciar os apps
#  Uso: clique direito > "Executar com o PowerShell"  ou  .\iniciar.ps1
#
#  O Supabase (banco na nuvem) esta SEMPRE no ar — nada a reiniciar la.
#  Este script sobe os dois apps locais:
#     Coleta (totem) .... http://localhost:5173
#     Painel (gestao) ... http://localhost:5174
# =====================================================================

$ErrorActionPreference = 'Stop'

function Preparar($caminho, $nome) {
  if (-not (Test-Path (Join-Path $caminho 'node_modules'))) {
    Write-Host "  [$nome] instalando dependencias (1-2 min)..." -ForegroundColor Yellow
    Push-Location $caminho; npm install; Pop-Location
  }
}

$coleta = Join-Path $PSScriptRoot 'app'
$painel = Join-Path $PSScriptRoot 'dashboard'

Write-Host ''
Write-Host '  Instituto Sao Vicente - Pesquisa de Satisfacao' -ForegroundColor Cyan
Write-Host '  ----------------------------------------------' -ForegroundColor DarkGray

Preparar $coleta 'coleta'
Preparar $painel 'painel'

# sobe cada app na sua propria janela
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$coleta'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$painel'; npm run dev"

Write-Host '  Aguardando os servidores subirem...' -ForegroundColor DarkGray
Start-Sleep -Seconds 6

Start-Process 'http://localhost:5173'   # coleta (totem)
Start-Process 'http://localhost:5174'   # painel (gestao)

Write-Host ''
Write-Host '  Coleta (totem) : http://localhost:5173' -ForegroundColor Green
Write-Host '  Painel (gestao): http://localhost:5174' -ForegroundColor Green
Write-Host ''
Write-Host '  Feche as janelas do PowerShell abertas para parar os servidores.' -ForegroundColor DarkGray
