# Produto ISV — Pesquisa de Satisfação (SaaS)

Produto novo, construído **do zero** sobre Supabase, usando o `mspesquisa`
como planta baixa (modelo de dados) e o instrumento do ISV em produção como referência
funcional. **Não altera** as pastas originais `mspesquisa-back-main` / `mspesquisa-front-main`.

> Fase 1 do roadmap (ver `../Plano-Produto-ISV.pdf`) — schema pronto, coleta e painel
> funcionando; falta o cutover (deploy real + desligar o sistema antigo).

## Estrutura

```
produto-isv/
├── db/                     SQL do banco (rodar em ordem no Supabase, 01→10)
│   ├── 01_schema.sql       Tipos, tabelas e índices
│   ├── 02_rls.sql          Row Level Security (isolamento multi-instituto)
│   ├── 03_views.sql        Agregações: satisfação, NPS, distribuição, comentários
│   ├── 04_seed_exemplo.sql Instituto ISV + 2 modelos de questionário + resposta de teste
│   ├── 05_bootstrap_admin.sql
│   ├── 06..09              Correções de segurança (RLS, RPC transacional/idempotente)
│   └── 10_pareamento_totem.sql  Pareamento do totem por código de uso único
├── scripts/                Utilitários Node (rodam local, usam service_role)
│   ├── gerar-codigo-totem.mjs   Gera código de pareamento pra um tablet novo
│   ├── selecionar-modelo.mjs    Troca qual questionário está ativo
│   └── ...
├── app/                    O app único (coleta + painel), Vite + React + supabase-js
│   └── ver app/README.md pra detalhes de como funciona o portão de entrada
└── iniciar.ps1              Sobe o app local (http://localhost:5173)
```

Coleta e painel de gestão são **um só app** — a tela inicial decide pra onde mandar
com base em quem faz login (ver `app/README.md`).

## Como aplicar no Supabase

1. Criar conta: <https://supabase.com/dashboard/sign-up> · novo projeto: <https://database.new>
2. No painel do projeto, abrir **SQL Editor**.
3. Colar e rodar os arquivos **nesta ordem**: `01` → `02` → `03` → `04`.
4. Conferir:
   ```sql
   select * from vw_satisfacao_unidade_mes;
   select * from vw_nps_unidade_mes;
   select * from vw_comentarios;
   ```

## Modelo de dados (resumo)

```
instituto            (tenant)                = Owner
  └ municipio        (agrupador/contrato)    = CompanyMaster
      └ unidade      (onde o tablet fica)    = Company
modelo_pesquisa → pergunta (tipo + ordem)    = DefaultSurvey / Question
resposta → resposta_item (valor OU texto)    = Survey / SurveyQuestion
usuario_perfil (estende auth.users)          = User (+ papel + escopo)
```

**Motor de perguntas tipado:** `pergunta.tipo ∈ (nps, estrela, carinha, texto)`.
Um instituto monta o formulário que quiser; a coleta grava `valor_num` (nps/estrela/carinha)
ou `valor_texto` (comentário) em `resposta_item`.

**Multi-instituto desde já:** toda tabela tem `instituto_id` + RLS. O isolamento é imposto
pelo banco. A tela de onboarding de novos institutos é Fase 3 — o schema já está pronto.

## Decisões travadas (17/07/2026, atualizado 21/07/2026)

- Instrumento **configurável por instituto**. O ISV tem dois modelos prontos —
  "(estrelas)", o instrumento real em produção hoje, e "(carinhas)", a variante
  visual do mspesquisa original — só um fica `ativo` por vez. Trocar com
  `node scripts/selecionar-modelo.mjs "estrelas"` (ou "carinhas"). Sem tela de
  admin ainda para isso (fica para a Fase 2 do plano de produto).
- Multi-instituto **schema-ready** agora; UI depois.
- **Migrar** todo o histórico do Google Sheets (script da Fase 1).

## Próximos passos

- [ ] Aplicar os 4 SQLs num projeto Supabase real.
- [ ] Script de migração da planilha (`Respostas`) → `resposta` / `resposta_item`.
- [ ] Apontar o PWA do ISV para o Supabase (`supabase-js`) no lugar do Apps Script.
