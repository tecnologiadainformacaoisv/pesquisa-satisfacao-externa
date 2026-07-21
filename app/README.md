# ISV — App (coleta + painel, unificados)

Um só app Vite + React + supabase-js com **dois papéis**: coleta de pesquisa (o "totem")
e painel de gestão (relatórios). Um portão de entrada (`App.jsx`) decide qual mostrar,
lendo o `papel` do `usuario_perfil` da sessão ativa — o mesmo endereço serve os dois.

## Rodar

```bash
cd produto-isv/app
npm install          # só na primeira vez
npm run dev          # abre em http://localhost:5173
```

Config em `app/.env` (ignorado pelo git) — só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
**Não há credencial de totem no `.env`** — ver "Pareamento" abaixo.

## Como funciona

- **Portão** (`App.jsx` → `avaliar()`): olha a sessão do Supabase. Sem sessão, mostra a
  escolha "Sou administrador" / "Sou o totem desta unidade". Com sessão, lê
  `usuario_perfil.papel` e manda direto para `ColetaTotem` (papel `totem`) ou
  `PainelAdmin` (qualquer papel de admin) — **sem passar pela escolha de novo**, porque
  a sessão persiste no `localStorage` do aparelho/navegador. Só aparece na primeira vez.
- **Sessão + pareamento do totem** (`lib/isv.js` → `sessaoAtiva`/`parear`): o totem entra
  ANÔNIMO (`supabase.auth.signInAnonymously`) — sem nenhuma credencial no bundle. Um aparelho
  anônimo ainda não tem `usuario_perfil`, então não grava nada. Na primeira vez, a tela pede um
  código de 8 letras que o TI gera com `../scripts/gerar-codigo-totem.mjs` e digita, uma vez,
  direto no aparelho. A RPC `parear_totem` (`../db/10_pareamento_totem.sql`) valida o código e
  vincula esse dispositivo — só ele — a um perfil `papel='totem'` da unidade certa.
- **Login do admin**: e-mail/senha normal (`supabase.auth.signInWithPassword`), como qualquer
  usuário Supabase Auth — precisa ter um `usuario_perfil` com papel de admin já cadastrado.
- **Coleta** (`ColetaTotem.jsx`): uma pergunta por tela, renderizada pelo `tipo`
  (`nps` 0–10, `estrela`, `carinha`, `texto`). Botões grandes, tema claro fixo, funciona
  offline (Service Worker, ver `vite.config.js`) depois da primeira carga.
- **Envio** (`enviar`): chama a RPC `registrar_resposta` (`../db/08`/`09`) — resposta + itens
  numa transação, id gerado no cliente (idempotente). Se estiver offline ou falhar, enfileira em
  `localStorage` e reenvia quando a conexão volta (`tentarEnviarFila`).
- **Painel** (`PainelAdmin.jsx`): KPIs, NPS, satisfação por unidade/mês, comentários — lê as
  views do Supabase (`lib/dados.js`), tudo sob RLS (só enxerga o próprio instituto).

## Pareamento de um tablet novo

```bash
node ../scripts/gerar-codigo-totem.mjs "Nome da Unidade"
```

Digite o código de 8 letras na tela do tablet — expira em 30-60 min (ajustável) e só
funciona uma vez. Exige o toggle "Allow anonymous sign-ins" ativado no Supabase
(Authentication → Sign In / Providers).

## Pendências

- [ ] Tela de configuração da unidade (hoje fixa via `usuario_perfil`).
- [ ] Tela de admin pra cadastrar unidade/pergunta/usuário (hoje é via script/SQL).
