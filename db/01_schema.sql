-- =============================================================
--  PRODUTO ISV — Pesquisa de Satisfação (SaaS multi-instituto)
--  01 · SCHEMA — tipos, tabelas, índices
--  Alvo: Supabase (PostgreSQL). Rodar no SQL Editor, nesta ordem:
--        01_schema.sql → 02_rls.sql → 03_views.sql → 04_seed_exemplo.sql
-- =============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- -------------------------------------------------------------
--  TIPOS (enums)
-- -------------------------------------------------------------

-- Papéis de usuário (espelham os do mspesquisa, adaptados ao SaaS)
do $$ begin
  create type papel_usuario as enum (
    'admin',            -- super admin (cross-instituto, só a operação do produto)
    'admin_instituto',  -- administra um instituto inteiro
    'admin_municipio',  -- administra um município/contrato
    'admin_unidade',    -- administra uma unidade
    'auditor',          -- só leitura de relatórios
    'totem'             -- dispositivo de coleta (kiosque)
  );
exception when duplicate_object then null; end $$;

-- Tipos de pergunta — o "motor tipado" que une ISV e mspesquisa
do $$ begin
  create type tipo_pergunta as enum (
    'nps',      -- nota 0–10
    'estrela',  -- 1–5 estrelas
    'carinha',  -- 1–5 (escala de faces)
    'texto'     -- comentário livre
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type turno as enum ('dia', 'noite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type genero as enum ('masculino', 'feminino', 'outro', 'nao_informado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_resposta as enum ('totem', 'link');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
--  Gatilho genérico de atualizado_em
-- -------------------------------------------------------------
create or replace function set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- -------------------------------------------------------------
--  INSTITUTO  (tenant do SaaS)                    [= Owner]
-- -------------------------------------------------------------
create table if not exists instituto (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text not null unique,           -- p/ subdomínio/URL futuro
  logo_url      text,
  cor_acento    text default '#0B6E63',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger trg_instituto_upd before update on instituto
  for each row execute function set_atualizado_em();

-- -------------------------------------------------------------
--  MUNICIPIO  (agrupador / contrato)      [= CompanyMaster]
-- -------------------------------------------------------------
create table if not exists municipio (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  nome          text not null,
  uf            text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_municipio_instituto on municipio(instituto_id);
create trigger trg_municipio_upd before update on municipio
  for each row execute function set_atualizado_em();

-- -------------------------------------------------------------
--  UNIDADE  (onde o tablet fica)                [= Company]
-- -------------------------------------------------------------
create table if not exists unidade (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  municipio_id  uuid not null references municipio(id) on delete cascade,
  nome          text not null,
  tipo          text,                            -- UBS, UPA, Hospital, Clínica...
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_unidade_instituto on unidade(instituto_id);
create index if not exists idx_unidade_municipio on unidade(municipio_id);
create trigger trg_unidade_upd before update on unidade
  for each row execute function set_atualizado_em();

-- -------------------------------------------------------------
--  USUARIO_PERFIL  (estende o auth.users do Supabase)  [= User]
--  Auth/senha ficam no Supabase Auth; aqui só o papel e o escopo.
-- -------------------------------------------------------------
create table if not exists usuario_perfil (
  id            uuid primary key references auth.users(id) on delete cascade,
  instituto_id  uuid references instituto(id) on delete cascade,  -- null = super admin
  nome          text,
  papel         papel_usuario not null,
  municipio_id  uuid references municipio(id) on delete set null, -- escopo opcional
  unidade_id    uuid references unidade(id)  on delete set null,  -- escopo opcional
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_perfil_instituto on usuario_perfil(instituto_id);
create trigger trg_perfil_upd before update on usuario_perfil
  for each row execute function set_atualizado_em();

-- -------------------------------------------------------------
--  MODELO_PESQUISA  (questionário como dado)   [= DefaultSurvey]
-- -------------------------------------------------------------
create table if not exists modelo_pesquisa (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  nome          text not null,
  descricao     text,
  -- escopo opcional: se municipio/unidade forem null, vale p/ o instituto todo
  municipio_id  uuid references municipio(id) on delete cascade,
  unidade_id    uuid references unidade(id)  on delete cascade,
  coleta_demografia boolean not null default false,  -- pede idade/gênero/turno?
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_modelo_instituto on modelo_pesquisa(instituto_id);
create trigger trg_modelo_upd before update on modelo_pesquisa
  for each row execute function set_atualizado_em();

-- -------------------------------------------------------------
--  PERGUNTA                              [= DefaultSurveyQuestion]
-- -------------------------------------------------------------
create table if not exists pergunta (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  modelo_id     uuid not null references modelo_pesquisa(id) on delete cascade,
  ordem         int  not null default 1,
  tipo          tipo_pergunta not null,
  texto         text not null,
  obrigatoria   boolean not null default true,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_pergunta_modelo on pergunta(modelo_id);
create index if not exists idx_pergunta_instituto on pergunta(instituto_id);
create trigger trg_pergunta_upd before update on pergunta
  for each row execute function set_atualizado_em();

-- -------------------------------------------------------------
--  RESPOSTA  (um envio do formulário)               [= Survey]
-- -------------------------------------------------------------
create table if not exists resposta (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  unidade_id    uuid not null references unidade(id) on delete cascade,
  modelo_id     uuid not null references modelo_pesquisa(id) on delete cascade,
  -- demografia opcional (herdada do mspesquisa)
  faixa_etaria  text,
  genero        genero,
  turno         turno,
  origem        origem_resposta not null default 'totem',
  criado_em     timestamptz not null default now()
);
create index if not exists idx_resposta_instituto on resposta(instituto_id);
create index if not exists idx_resposta_unidade   on resposta(unidade_id);
create index if not exists idx_resposta_modelo    on resposta(modelo_id);
create index if not exists idx_resposta_criado    on resposta(criado_em);

-- -------------------------------------------------------------
--  RESPOSTA_ITEM  (uma pergunta respondida)  [= SurveyQuestion]
--  valor_num  → nps / estrela / carinha
--  valor_texto→ texto (comentário)
-- -------------------------------------------------------------
create table if not exists resposta_item (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  resposta_id   uuid not null references resposta(id) on delete cascade,
  pergunta_id   uuid references pergunta(id) on delete set null,
  tipo          tipo_pergunta not null,          -- desnormalizado p/ análise rápida
  valor_num     int,
  valor_texto   text,
  criado_em     timestamptz not null default now(),
  constraint chk_item_valor check (valor_num is not null or valor_texto is not null)
);
create index if not exists idx_item_resposta  on resposta_item(resposta_id);
create index if not exists idx_item_instituto on resposta_item(instituto_id);
create index if not exists idx_item_tipo      on resposta_item(tipo);

-- =============================================================
--  Fim do 01_schema.sql
-- =============================================================
