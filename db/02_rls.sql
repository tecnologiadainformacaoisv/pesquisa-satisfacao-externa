-- =============================================================
--  PRODUTO ISV — 02 · RLS (Row Level Security)
--  Isolamento multi-instituto imposto pelo BANCO, não pela app.
--  Cada usuário só enxerga o próprio instituto_id; 'admin' vê tudo.
-- =============================================================

-- -------------------------------------------------------------
--  Funções auxiliares (lêem o usuário logado via auth.uid())
-- -------------------------------------------------------------
create or replace function current_instituto_id()
returns uuid language sql stable security definer
set search_path = public as $$
  select instituto_id from usuario_perfil where id = auth.uid();
$$;

create or replace function current_papel()
returns papel_usuario language sql stable security definer
set search_path = public as $$
  select papel from usuario_perfil where id = auth.uid();
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce((select papel = 'admin' from usuario_perfil where id = auth.uid()), false);
$$;

-- Regra padrão de visibilidade: super admin vê tudo; demais, só o seu instituto.
--   (usada como USING em SELECT/UPDATE/DELETE e WITH CHECK em INSERT)

-- -------------------------------------------------------------
--  Habilita RLS em todas as tabelas
-- -------------------------------------------------------------
alter table instituto        enable row level security;
alter table municipio        enable row level security;
alter table unidade          enable row level security;
alter table usuario_perfil   enable row level security;
alter table modelo_pesquisa  enable row level security;
alter table pergunta         enable row level security;
alter table resposta         enable row level security;
alter table resposta_item    enable row level security;

-- -------------------------------------------------------------
--  INSTITUTO
-- -------------------------------------------------------------
create policy instituto_sel on instituto for select using (
  is_super_admin() or id = current_instituto_id()
);
create policy instituto_mod on instituto for all using (
  is_super_admin() or (id = current_instituto_id() and current_papel() = 'admin_instituto')
) with check (
  is_super_admin() or (id = current_instituto_id() and current_papel() = 'admin_instituto')
);

-- -------------------------------------------------------------
--  Macro: política padrão por instituto_id para tabelas de dados
--  (SELECT p/ todos do instituto; escrita p/ papéis administrativos)
-- -------------------------------------------------------------
-- MUNICIPIO
create policy municipio_sel on municipio for select using (
  is_super_admin() or instituto_id = current_instituto_id()
);
create policy municipio_mod on municipio for all using (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio'))
) with check (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio'))
);

-- UNIDADE
create policy unidade_sel on unidade for select using (
  is_super_admin() or instituto_id = current_instituto_id()
);
create policy unidade_mod on unidade for all using (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio','admin_unidade'))
) with check (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio','admin_unidade'))
);

-- USUARIO_PERFIL
--  Cada um lê o próprio perfil; admins do instituto leem os do instituto.
create policy perfil_sel on usuario_perfil for select using (
  id = auth.uid()
  or is_super_admin()
  or (instituto_id = current_instituto_id() and current_papel() in ('admin_instituto','admin_municipio'))
);
create policy perfil_mod on usuario_perfil for all using (
  is_super_admin() or (instituto_id = current_instituto_id() and current_papel() = 'admin_instituto')
) with check (
  is_super_admin() or (instituto_id = current_instituto_id() and current_papel() = 'admin_instituto')
);

-- MODELO_PESQUISA
create policy modelo_sel on modelo_pesquisa for select using (
  is_super_admin() or instituto_id = current_instituto_id()
);
create policy modelo_mod on modelo_pesquisa for all using (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio'))
) with check (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio'))
);

-- PERGUNTA
create policy pergunta_sel on pergunta for select using (
  is_super_admin() or instituto_id = current_instituto_id()
);
create policy pergunta_mod on pergunta for all using (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio'))
) with check (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio'))
);

-- -------------------------------------------------------------
--  RESPOSTA / RESPOSTA_ITEM
--  Coleta: o totem (autenticado como papel 'totem') INSERE no seu instituto.
--  Leitura: qualquer papel do instituto (para relatórios).
--  Sem UPDATE/DELETE por padrão — resposta é registro imutável.
-- -------------------------------------------------------------
create policy resposta_sel on resposta for select using (
  is_super_admin() or instituto_id = current_instituto_id()
);
create policy resposta_ins on resposta for insert with check (
  instituto_id = current_instituto_id()
  and current_papel() in ('totem','admin_instituto','admin_municipio','admin_unidade')
);

create policy item_sel on resposta_item for select using (
  is_super_admin() or instituto_id = current_instituto_id()
);
create policy item_ins on resposta_item for insert with check (
  instituto_id = current_instituto_id()
  and current_papel() in ('totem','admin_instituto','admin_municipio','admin_unidade')
);

-- =============================================================
--  Fim do 02_rls.sql
--  OBS.: se no futuro a coleta for 100% anônima (sem login no tablet),
--  troca-se o INSERT por uma função RPC 'security definer' que valida
--  a unidade e grava — mantendo a tabela fechada para 'anon'.
-- =============================================================
