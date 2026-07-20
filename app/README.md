# ISV — App de Coleta (totem)

Formulário de pesquisa de satisfação (o "totem") do produto novo, em **Vite + React + supabase-js**.
Lê o questionário do Supabase (motor de perguntas tipado) e grava as respostas via RLS.

## Rodar

```bash
cd produto-isv/app
npm install          # só na primeira vez
npm run dev          # abre em http://localhost:5173
```

Config em `app/.env` (ignorado pelo git) — só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
**Não há credencial de totem no `.env`** — ver "Pareamento" abaixo.

## Como funciona

- **Sessão + pareamento** (`lib/isv.js` → `sessaoAtiva`/`estaPareado`/`parear`): o app entra
  ANÔNIMO (`supabase.auth.signInAnonymously`) — sem nenhuma credencial no bundle. Um aparelho
  anônimo ainda não tem `usuario_perfil`, então não grava nada. Na primeira vez, a tela pede um
  código de 8 letras que o TI gera com `../scripts/gerar-codigo-totem.mjs` e digita, uma vez,
  direto no aparelho. A RPC `parear_totem` (`../db/10_pareamento_totem.sql`) valida o código e
  vincula esse dispositivo — só ele — a um perfil `papel='totem'` da unidade certa. Depois disso
  a sessão persiste no `localStorage` do aparelho; o pareamento não se repete.
- **Config** (`carregarConfig`): lê instituto, unidade, modelo e perguntas via RLS.
- **Coleta** (`App.jsx`): uma pergunta por tela, renderizada pelo `tipo`
  (`nps` 0–10, `estrela`, `carinha`, `texto`). Botões grandes, tema claro fixo.
- **Envio** (`enviar`): chama a RPC `registrar_resposta` (`../db/08`/`09`) — resposta + itens
  numa transação, id gerado no cliente (idempotente). Se estiver offline ou falhar, enfileira em
  `localStorage` e reenvia quando a conexão volta (`tentarEnviarFila`).

## Pareamento de um tablet novo

```bash
node ../scripts/gerar-codigo-totem.mjs "Nome da Unidade"
```

Digite o código de 8 letras na tela do tablet — expira em 30 min e só funciona uma vez.
Exige o toggle "Allow anonymous sign-ins" ativado no Supabase (Authentication → Sign In / Providers).

## Pendências

- [ ] Service Worker / PWA (instalável, cache offline).
- [ ] Tela de configuração da unidade (hoje fixa via `usuario_perfil`).
