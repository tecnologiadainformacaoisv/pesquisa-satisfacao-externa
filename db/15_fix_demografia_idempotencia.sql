-- =============================================================
--  PRODUTO ISV — 15 · Corrige regressão do 12 (achado por isolamento)
--  Rode no SQL Editor.
--
--  CAUSA RAIZ CONFIRMADA
--  O 12 trocou a gravação por "insert ... on conflict (id) do nothing",
--  que precisa ENXERGAR a linha em conflito pra decidir se ignora —
--  e o totem não tem SELECT em 'resposta' (política do 07, de propósito:
--  "totem NÃO lê respostas"). Resultado: TODO insert do totem passou a
--  cair em RLS, mesmo sem conflito nenhum. Esse exato problema já tinha
--  sido resolvido no 09 (troca de ON CONFLICT por um pré-check via
--  resposta_existe(), um helper SECURITY DEFINER que só devolve um
--  booleano). O 12 regrediu esse fix sem querer. Este arquivo restaura
--  o padrão do 09, mantendo os 3 campos novos de demografia.
--
--  Também remove a função de debug temporária do 14.
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
  if v_inst is null or current_papel() is null then
    raise exception 'contexto vazio: instituto=% papel=%', v_inst, current_papel();
  end if;

  -- reenvio da fila offline: já gravada, sai sem duplicar item nenhum
  if resposta_existe(p_id) then
    return p_id;
  end if;

  insert into resposta (id, instituto_id, unidade_id, modelo_id, origem, faixa_etaria, genero, turno)
  values (p_id, v_inst, p_unidade, p_modelo, p_origem, p_faixa_etaria, p_genero, p_turno);

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

-- Dois envios simultâneos do mesmo id passariam os dois pelo
-- resposta_existe(). A PK ainda protege: o perdedor cai aqui.
exception when unique_violation then
  return p_id;
end $$;

revoke all on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta, text, genero, turno) from public, anon;
grant execute on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta, text, genero, turno) to authenticated;

-- limpeza do helper de debug temporário do 14
drop function if exists debug_resposta_check(uuid, uuid);

-- Depois de rodar:  node produto-isv/scripts/testar-seguranca.mjs
