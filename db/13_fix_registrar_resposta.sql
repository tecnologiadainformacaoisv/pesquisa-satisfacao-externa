-- =============================================================
--  PRODUTO ISV — 13 · Corrige registrar_resposta (achado testando o 12)
--  Rode no SQL Editor.
--
--  Depois de aplicar o 12 (que adiciona faixa_etaria/genero/turno),
--  TODA gravação de resposta passou a falhar com "new row violates
--  row-level security policy for table resposta" — inclusive sem usar
--  os campos novos, inclusive no ISV (que nunca falhou antes). Suspeita:
--  o "drop function if exists registrar_resposta(uuid, uuid, uuid,
--  jsonb, origem_resposta)" do 12 pode não ter batido com a assinatura
--  exata que já estava no banco, deixando DUAS versões da função
--  registradas ao mesmo tempo (ambíguo pro PostgREST escolher).
--
--  Este arquivo apaga TODAS as versões de registrar_resposta (não
--  importa a assinatura) antes de recriar — garante que sobra exatamente
--  uma.
-- =============================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'registrar_resposta'
  loop
    execute format('drop function %s', r.assinatura);
  end loop;
end $$;

create function registrar_resposta(
  p_id           uuid,
  p_unidade      uuid,
  p_modelo       uuid,
  p_itens        jsonb,
  p_origem       origem_resposta default 'totem',
  p_faixa_etaria text default null,
  p_genero       genero default null,
  p_turno        turno default null
) returns uuid
language plpgsql
security invoker
set search_path = public as $$
declare
  v_inst uuid := current_instituto_id();
  it     jsonb;
begin
  if v_inst is null then
    raise exception 'usuario sem instituto';
  end if;

  insert into resposta (id, instituto_id, unidade_id, modelo_id, origem, faixa_etaria, genero, turno)
  values (p_id, v_inst, p_unidade, p_modelo, p_origem, p_faixa_etaria, p_genero, p_turno)
  on conflict (id) do nothing;

  if not found then
    return p_id;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into resposta_item
      (instituto_id, resposta_id, pergunta_id, tipo, valor_num, valor_texto)
    values (
      v_inst,
      p_id,
      nullif(it->>'pergunta_id','')::uuid,
      (it->>'tipo')::tipo_pergunta,
      nullif(it->>'valor_num','')::int,
      nullif(it->>'valor_texto','')
    );
  end loop;

  return p_id;
end $$;

revoke all on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta, text, genero, turno) from public, anon;
grant execute on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta, text, genero, turno) to authenticated;

-- Confira que sobrou exatamente UMA versão:
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='registrar_resposta';

-- Depois de rodar:  node produto-isv/scripts/testar-seguranca.mjs
