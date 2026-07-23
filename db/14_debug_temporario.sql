-- =============================================================
--  PRODUTO ISV — 14 · DEBUG TEMPORÁRIO (apagar depois de usar)
--  Rode no SQL Editor. Só serve pra eu enxergar, de dentro de uma
--  função (mesmo contexto de registrar_resposta), o que
--  current_instituto_id()/current_papel()/current_unidade_id()
--  realmente retornam — pra achar por que o INSERT direto passa
--  mas o mesmo INSERT dentro da função falha por RLS.
-- =============================================================

create or replace function debug_resposta_check(p_unidade uuid, p_modelo uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public as $$
declare
  v_inst      uuid := current_instituto_id();
  v_papel     papel_usuario := current_papel();
  v_un_atual  uuid := current_unidade_id();
  v_uid       uuid := auth.uid();
  v_unidade_ok boolean;
  v_modelo_ok  boolean;
begin
  select exists(select 1 from unidade u where u.id = p_unidade and u.instituto_id = v_inst) into v_unidade_ok;
  select exists(select 1 from modelo_pesquisa m where m.id = p_modelo and m.instituto_id = v_inst) into v_modelo_ok;

  return jsonb_build_object(
    'auth_uid', v_uid,
    'v_inst', v_inst,
    'v_papel', v_papel,
    'v_un_atual', v_un_atual,
    'p_unidade_recebido', p_unidade,
    'p_modelo_recebido', p_modelo,
    'unidade_pertence_instituto', v_unidade_ok,
    'modelo_pertence_instituto', v_modelo_ok,
    'check_instituto_not_null', v_inst is not null,
    'check_papel_in_list', v_papel in ('totem','admin_instituto','admin_municipio','admin_unidade'),
    'check_unidade_bate', (v_papel <> 'totem' or p_unidade = v_un_atual)
  );
end $$;

revoke all on function debug_resposta_check(uuid, uuid) from public, anon;
grant execute on function debug_resposta_check(uuid, uuid) to authenticated;

-- Depois de eu terminar de usar, rode pra limpar:
--   drop function if exists debug_resposta_check(uuid, uuid);
