-- =============================================================
--  PRODUTO ISV — 05 · BOOTSTRAP do 1º admin
--  Liga um usuário do Supabase Auth ao instituto ISV como admin.
--
--  ANTES de rodar:
--    1) No painel: Authentication → Users → Add user
--       (informe e-mail + senha; marque "Auto Confirm User")
--    2) Troque o e-mail na linha abaixo pelo que você criou.
--    3) Rode este arquivo no SQL Editor.
-- =============================================================

do $$
declare
  v_email text := 'tecnologiadainformacao@institutosaovicente.com.br';   -- <<< EDITE AQUI
  v_uid   uuid;
  v_inst  uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Usuário "%" não existe em auth.users. Crie em Authentication → Add user antes.', v_email;
  end if;

  select id into v_inst from instituto where slug = 'isv';
  if v_inst is null then
    raise exception 'Instituto ISV não encontrado. Rode o 04_seed_exemplo.sql antes.';
  end if;

  insert into usuario_perfil (id, instituto_id, nome, papel, ativo)
  values (v_uid, v_inst, 'Administrador ISV', 'admin_instituto', true)
  on conflict (id) do update
    set instituto_id = excluded.instituto_id,
        papel        = excluded.papel,
        ativo        = true;

  raise notice 'OK: perfil admin_instituto criado para % no instituto ISV (%).', v_email, v_inst;
end $$;

-- =============================================================
--  Fim do 05_bootstrap_admin.sql
-- =============================================================
