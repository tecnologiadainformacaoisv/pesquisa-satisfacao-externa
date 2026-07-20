-- =============================================================
--  PRODUTO ISV — 08 · RPC de gravação da coleta
--  Rode no SQL Editor (idempotente).
--
--  Resolve DOIS problemas de uma vez:
--
--  (a) O totem não pode LER respostas (política do 07), mas o app
--      precisava do id de volta para gravar os itens — e devolver a
--      linha recém-inserida passa pela política de SELECT. Resultado:
--      a gravação legítima era barrada. Aqui o id vem do CLIENTE,
--      então nada precisa ser devolvido.
--
--  🔴 5 (b) As duas gravações (resposta + itens) eram requisições
--      separadas: se a segunda falhasse, ficava uma resposta órfã
--      contando no denominador das métricas. Dentro da função é uma
--      transação só — ou grava tudo, ou nada.
--
--  Reenvio da fila offline é idempotente: o mesmo id colide na PK,
--  o 'on conflict do nothing' devolve o id e não duplica nada.
--
--  SECURITY INVOKER de propósito: a RLS continua valendo aqui dentro.
--  A função não é um atalho para escrever — é só a forma correta de
--  escrever. Quem não passa nas políticas do 07 continua barrado.
-- =============================================================

create or replace function registrar_resposta(
  p_id       uuid,
  p_unidade  uuid,
  p_modelo   uuid,
  p_itens    jsonb,
  p_origem   origem_resposta default 'totem'
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

  insert into resposta (id, instituto_id, unidade_id, modelo_id, origem)
  values (p_id, v_inst, p_unidade, p_modelo, p_origem)
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

revoke all on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta) from public, anon;
grant execute on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta) to authenticated;

-- =============================================================
--  Depois de rodar:  node produto-isv/scripts/testar-seguranca.mjs
-- =============================================================
