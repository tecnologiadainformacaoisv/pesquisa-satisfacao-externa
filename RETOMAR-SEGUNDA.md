# Ponto de retomada — segunda-feira

> Estado do projeto **Produto ISV** ao encerrar sexta, 17/07/2026.
> Objetivo do projeto: replicar a robustez do mspesquisa (multi-instituto, RLS,
> questionário configurável) com a identidade do ISV, em base moderna (Vite + React + Supabase).

---

## ▶ Como retomar (2 passos)

1. **Ligar o app de coleta:** rode **`produto-isv/iniciar.ps1`**
   (clique direito → *Executar com o PowerShell*). Ele abre `http://localhost:5173`.
2. **Rodar a pendência de segurança** (uma vez só): no Supabase → SQL Editor,
   cole e execute **`produto-isv/db/06_rls_totem.sql`**.

Não precisa reiniciar o banco: **o Supabase é nuvem, está sempre no ar.**

---

## O que precisa reiniciar (porque o PC vai desligar)

| Serviço | Onde | Reiniciar? | Como |
|---|---|---|---|
| **Supabase** (banco, auth, API) | nuvem | **Não** — sempre up | — |
| **App de coleta** (Vite, :5173) | local | **Sim** | `produto-isv/iniciar.ps1` |
| Demo do mspesquisa original (:3000/3001 + Postgres) | local | Só se for mostrar de novo | precisa relançar Postgres+back+front manualmente (peça que eu faço um script) |

---

## Estado atual (o que está pronto)

- ✅ **Fase 0 — Fundação:** schema da fusão no Supabase (8 tabelas + 4 views), RLS
  multi-instituto **comprovada** (anônimo não vê nada; admin logado vê só o seu instituto).
- ✅ **Admin do ISV** criado: `tecnologiadainformacao@institutosaovicente.com.br`.
- ✅ **Coleta (totem)** construída em Vite+React e **testada de ponta a ponta** —
  login do totem → carrega questionário do banco → grava resposta (NPS + 4 estrelas + comentário).
- ✅ Documentos: `Resumo-Executivo-ISV.pdf`, `Plano-Produto-ISV.pdf`, `Proposta-Visual-ISV.pdf` (raiz).

## Pendências (em ordem)

1. **[segurança] Rodar `db/06_rls_totem.sql`** — impede o tablet de ler respostas alheias.
2. **[construir] Dashboard** — próxima tela: painel de gestão lendo as views
   (`vw_nps_unidade_mes`, `vw_satisfacao_unidade_mes`, `vw_comentarios`), com a cara do ISV.
3. **[offline] Service Worker / PWA** — tornar o app instalável e 100% offline
   (a fila offline em localStorage já existe; falta o cache do app).
4. **[segurança] Trocar a senha do admin** — hoje é fraca (`123456`), só para teste.
5. **[limpeza] Zerar respostas de teste** — há 2 no banco (seed + verificação).

---

## ⚠ Achados da revisão técnica (corrigir ANTES de produção)

Revisão automatizada do commit inicial encontrou brechas — a maioria no isolamento
multi-instituto (o core do produto). Nenhuma bloqueia o desenvolvimento local, mas
todas precisam ser resolvidas antes de dado real. Prioridade alta em negrito.

**🔴 Críticos**
1. **RLS `perfil_mod` permite escalada:** um `admin_instituto` pode fazer `UPDATE` de
   um perfil para `papel='admin'` (super-admin) e furar o isolamento. Corrigir o
   `WITH CHECK` (proibir gravar `papel='admin'` salvo se já for super-admin).
2. **INSERT não valida tenant das FKs:** totem pode gravar `resposta.unidade_id`/
   `modelo_id` de OUTRO instituto (só checa `instituto_id` da própria linha). Precisa
   trigger `BEFORE INSERT` ou FK composta `(instituto_id, id)`.
3. **Totem não é preso à própria unidade:** pode gravar em qualquer unidade do
   instituto. RLS deve exigir `unidade_id = (perfil do totem)`.
4. **Credenciais do totem vão no bundle** (`VITE_*` inlined). Endurecer a RLS (1–3)
   primeiro; considerar RPC `security definer` chamada por `anon` (já previsto em 02_rls.sql).
5. **Envio não idempotente → duplica métricas:** `enviar()` faz 2 inserts; falha de
   rede reenfileira e duplica a resposta. Mover para RPC transacional com id gerado
   no cliente + `on conflict do nothing`.

**🟡 Avisos** — corrida na fila offline (sem lock); `carregarConfig` ignora `ativo`/escopo
do modelo; `valor_num` sem CHECK de faixa (0–10 / 1–5) no banco; `resposta_item.tipo`
não validado contra `pergunta.tipo`; pergunta de texto `obrigatoria` não é exigida na UI.

**💡 Sugestões** — `app/.env.example` dedicado; usar `dotenv` nos scripts; `vw_comentarios`
expor `pergunta_id`; simplificar destructuring em `migrar.mjs:146`.

**Sólido:** RLS ativa em todas as tabelas; `SECURITY DEFINER` com `search_path` fixo
(sem hijacking); views com `security_invoker`; migração com proteção anti-duplicação.

> Sugestão de ordem segunda: **dashboard** (não depende dos fixes) e, em paralelo,
> fechar os críticos 1–3 (RLS) que são rápidos e protegem o isolamento.

## Credenciais e acessos

- **Supabase:** projeto `kogyifdphdgbmubxzztd` — painel em supabase.com (sua conta).
- **Admin (gestão):** `tecnologiadainformacao@institutosaovicente.com.br` / senha que você definiu.
- **Totem (coleta):** `totem@institutosaovicente.com.br` — senha no `produto-isv/app/.env`.
- Chaves do Supabase e senhas ficam em `produto-isv/.env` e `produto-isv/app/.env`
  (**ignorados pelo git** — não versionados).

## Mapa da pasta `produto-isv/`

```
produto-isv/
├── RETOMAR-SEGUNDA.md      ← este arquivo
├── iniciar.ps1             ← sobe o app de coleta
├── README.md              ← visão geral do produto
├── .env / .env.example    ← chaves do Supabase (segredo / modelo)
├── db/                    ← SQL do banco (rodar na ordem 01→06 no Supabase)
│   ├── 01_schema.sql  02_rls.sql  03_views.sql
│   ├── 04_seed_exemplo.sql  05_bootstrap_admin.sql  06_rls_totem.sql
├── scripts/               ← utilitários Node (rodam local)
│   ├── verificar.mjs        (conexão + RLS)
│   ├── verificar-login.mjs  (prova RLS logado)
│   ├── criar-totem.mjs      (cria usuário do tablet)
│   └── migrar.mjs           (Sheets→Supabase; provavelmente sem uso — não há dados reais)
└── app/                   ← o app de coleta (Vite + React)
    ├── iniciar via ../iniciar.ps1  ·  http://localhost:5173
    └── src/ (App.jsx, lib/isv.js, lib/supabase.js, styles.css)
```

## Decisões travadas

- Questionário **configurável por instituto** (motor tipado: nps/estrela/carinha/texto).
- **Multi-instituto** no schema desde já; tela de onboarding fica para depois.
- **Sem migração** de dados: a planilha só tinha testes, começamos limpo.
- Stack nova: **Vite + React + supabase-js**. NÃO portar o código do mspesquisa.
