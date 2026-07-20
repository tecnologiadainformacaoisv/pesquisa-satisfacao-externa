-- =============================================================
--  PRODUTO ISV — 09 · Conserta a idempotência da RPC do 08
--  Rode no SQL Editor (idempotente). SUBSTITUI a função do 08.
--
--  O QUE DEU ERRADO NO 08
--  O 'on conflict (id) do nothing' precisa enxergar a linha em
--  conflito — e o totem não tem SELECT em 'resposta' (política do 07).
--  Resultado: a gravação era barrada mesmo estando tudo correto.
--  Provado por isolamento: INSERT direto = 201; a MESMA linha pela RPC
--  com on conflict = 403, inclusive com a lista de itens vazia.
--
--  O CONFLITO DE FUNDO
--  Detectar duplicata exige LER a tabela; o cliente não pode ler.
--  Então a leitura sobe para um helper SECURITY DEFINER que devolve
--  só um booleano, restrito ao instituto do próprio usuário. É a menor
--  exposição possível: nenhum dado de resposta atravessa, e a GRAVAÇÃO
--  continua sob RLS (a função segue SECURITY INVOKER).
-- =============================================================

create or replace function resposta_existe(p_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from resposta
    where id = p_id and instituto_id = current_instituto_id()
  );
$$;

revoke all on function resposta_existe(uuid) from public, anon;
grant execute on function resposta_existe(uuid) to authenticated;

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
  -- Guarda com mensagem legível: se o contexto vier vazio, o erro diz
  -- o que faltou em vez de virar um 42501 genérico de RLS.
  if v_inst is null or current_papel() is null then
    raise exception 'contexto vazio: instituto=% papel=%', v_inst, current_papel();
  end if;

  -- reenvio da fila offline: já gravada, sai sem duplicar item nenhum
  if resposta_existe(p_id) then
    return p_id;
  end if;

  insert into resposta (id, instituto_id, unidade_id, modelo_id, origem)
  values (p_id, v_inst, p_unidade, p_modelo, p_origem);

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

revoke all on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta) from public, anon;
grant execute on function registrar_resposta(uuid, uuid, uuid, jsonb, origem_resposta) to authenticated;

-- =============================================================
--  Depois de rodar:  node produto-isv/scripts/testar-seguranca.mjs
-- =============================================================
