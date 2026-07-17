# ISV — App de Coleta (totem)

Formulário de pesquisa de satisfação (o "totem") do produto novo, em **Vite + React + supabase-js**.
Lê o questionário do Supabase (motor de perguntas tipado) e grava as respostas via RLS.

## Rodar

```bash
cd produto-isv/app
npm install          # só na primeira vez
npm run dev          # abre em http://localhost:5173
```

Config em `app/.env` (ignorado pelo git) — ver `../.env.example` para as chaves:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TOTEM_EMAIL`, `VITE_TOTEM_PASSWORD`.

## Como funciona

- **Login do totem** (`lib/isv.js` → `entrarComoTotem`): o app autentica como o usuário
  `totem@…` (papel `totem`), criado por `../scripts/criar-totem.mjs`. A sessão persiste.
- **Config** (`carregarConfig`): lê instituto, unidade, modelo e perguntas via RLS.
- **Coleta** (`App.jsx`): uma pergunta por tela, renderizada pelo `tipo`
  (`nps` 0–10, `estrela`, `carinha`, `texto`). Botões grandes, tema claro fixo.
- **Envio** (`enviar`): grava `resposta` + `resposta_item`. Se estiver offline ou falhar,
  enfileira em `localStorage` e reenvia quando a conexão volta (`tentarEnviarFila`).

## Pendências

- [ ] Rodar `../db/06_rls_totem.sql` (impede o totem de LER respostas alheias).
- [ ] Service Worker / PWA (instalável, cache offline).
- [ ] Tela de configuração da unidade (hoje fixa via usuário totem).
