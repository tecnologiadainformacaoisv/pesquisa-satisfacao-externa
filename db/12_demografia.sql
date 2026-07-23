-- =============================================================
--  PRODUTO ISV — 12 · Demografia opcional (Fase 2 do plano)
--  Rode no SQL Editor (idempotente).
--
--  O banco já tinha os campos desde o dia 1 (resposta.faixa_etaria/
--  genero/turno, modelo_pesquisa.coleta_demografia) — só a RPC de
--  gravação e o app de coleta nunca usavam. Este arquivo estende a RPC
--  pra aceitar os 3 campos (todos opcionais, default null).
--
--  drop + create (em vez de só "create or replace") porque mudar a
--  lista de parâmetros de uma função É criar uma assinatura diferente
--  — só um "or replace" deixaria as duas versões (5 e 8 parâmetros)
--  registradas ao mesmo tempo, o que gera ambiguidade de overload.
-- =============================================================

drop function if exists registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta);

create or replace function registrar_resposta(
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

  -- já existia: reenvio da fila offline. Sai sem duplicar os itens.
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

-- =============================================================
--  Depois de rodar:  node produto-isv/scripts/testar-seguranca.mjs
-- =============================================================
