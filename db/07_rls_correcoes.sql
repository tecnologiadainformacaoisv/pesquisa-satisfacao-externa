-- =============================================================
--  PRODUTO ISV — 07 · Correções de segurança (revisão técnica)
--
--  SUBSTITUI o 06_rls_totem.sql (inclui o conteúdo dele).
--  Rode este arquivo UMA VEZ no SQL Editor — é idempotente.
--
--  Corrige:
--   🔴 1 — escalada de privilégio: admin_instituto promovendo alguém a super-admin
--   🔴 2 — INSERT sem validar se as FKs são do mesmo instituto (vazamento cross-tenant)
--   🔴 3 — totem gravando em unidade que não é a dele
--   (06) — totem conseguindo LER respostas alheias
--   🟡    — valor_num sem faixa; resposta_item.tipo divergindo de pergunta.tipo
-- =============================================================

-- -------------------------------------------------------------
--  🔴 1 · Super-admin passa a exigir instituto_id NULO
--        (um 'admin' com instituto preenchido deixa de ser global)
-- -------------------------------------------------------------
create or replace function is_super_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select papel = 'admin' and instituto_id is null from usuario_perfil where id = auth.uid()),
  false);
$$;

-- Invariante no dado: 'admin' é global (sem instituto); os demais são de um instituto.
do $$ begin
  alter table usuario_perfil add constraint chk_admin_sem_instituto check (
    (papel =  'admin' and instituto_id is null)
    or (papel <> 'admin' and instituto_id is not null)
  );
exception when duplicate_object then null; end $$;

-- Política: admin_instituto administra o seu instituto, mas NÃO pode criar super-admin
drop policy if exists perfil_mod on usuario_perfil;
create policy perfil_mod on usuario_perfil for all
using (
  is_super_admin()
  or (instituto_id = current_instituto_id() and current_papel() = 'admin_instituto')
)
with check (
  is_super_admin()
  or (
    instituto_id = current_instituto_id()
    and current_papel() = 'admin_instituto'
    and papel <> 'admin'            -- <<< fecha a escalada
  )
);

-- -------------------------------------------------------------
--  🔴 2 · Validação de tenant nas FKs (trigger)
--        Impede gravar resposta apontando p/ unidade/modelo de outro instituto.
-- -------------------------------------------------------------
create or replace function valida_tenant_resposta()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if not exists (select 1 from unidade u
                 where u.id = new.unidade_id and u.instituto_id = new.instituto_id) then
    raise exception 'unidade % nao pertence ao instituto %', new.unidade_id, new.instituto_id;
  end if;
  if not exists (select 1 from modelo_pesquisa m
                 where m.id = new.modelo_id and m.instituto_id = new.instituto_id) then
    raise exception 'modelo % nao pertence ao instituto %', new.modelo_id, new.instituto_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_resposta_tenant on resposta;
create trigger trg_resposta_tenant before insert or update on resposta
  for each row execute function valida_tenant_resposta();

-- Idem para os itens: resposta e pergunta têm de ser do mesmo instituto,
-- e o 'tipo' do item tem de bater com o tipo real da pergunta (🟡).
create or replace function valida_tenant_item()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_inst uuid; v_tipo tipo_pergunta;
begin
  select instituto_id into v_inst from resposta where id = new.resposta_id;
  if v_inst is null or v_inst <> new.instituto_id then
    raise exception 'resposta % nao pertence ao instituto %', new.resposta_id, new.instituto_id;
  end if;

  if new.pergunta_id is not null then
    select tipo into v_tipo from pergunta
      where id = new.pergunta_id and instituto_id = new.instituto_id;
    if v_tipo is null then
      raise exception 'pergunta % nao pertence ao instituto %', new.pergunta_id, new.instituto_id;
    end if;
    if v_tipo <> new.tipo then
      raise exception 'tipo % nao confere com o tipo da pergunta (%)', new.tipo, v_tipo;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_item_tenant on resposta_item;
create trigger trg_item_tenant before insert or update on resposta_item
  for each row execute function valida_tenant_item();

-- -------------------------------------------------------------
--  🔴 3 · Totem só grava na PRÓPRIA unidade
-- -------------------------------------------------------------
drop policy if exists resposta_ins on resposta;
create policy resposta_ins on resposta for insert with check (
  instituto_id = current_instituto_id()
  and current_papel() in ('totem','admin_instituto','admin_municipio','admin_unidade')
  and (
    current_papel() <> 'totem'
    or unidade_id = (select unidade_id from usuario_perfil where id = auth.uid())
  )
);

-- -------------------------------------------------------------
--  (06) · Totem NÃO lê respostas
-- -------------------------------------------------------------
drop policy if exists resposta_sel on resposta;
create policy resposta_sel on resposta for select using (
  is_super_admin()
  or (instituto_id = current_instituto_id() and current_papel() <> 'totem')
);

drop policy if exists item_sel on resposta_item;
create policy item_sel on resposta_item for select using (
  is_super_admin()
  or (instituto_id = current_instituto_id() and current_papel() <> 'totem')
);

-- -------------------------------------------------------------
--  🟡 · Faixa válida por tipo de resposta (defesa no banco)
-- -------------------------------------------------------------
do $$ begin
  alter table resposta_item add constraint chk_valor_faixa check (
    valor_num is null
    or (tipo = 'nps' and valor_num between 0 and 10)
    or (tipo in ('estrela','carinha') and valor_num between 1 and 5)
  );
exception when duplicate_object then null; end $$;

-- =============================================================
--  Confira depois de rodar:
--    select polname from pg_policies where tablename in ('resposta','usuario_perfil');
--  E rode:  node produto-isv/scripts/testar-seguranca.mjs
-- =============================================================
