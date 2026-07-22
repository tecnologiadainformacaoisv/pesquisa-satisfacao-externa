-- =============================================================
--  PRODUTO ISV — 11 · Troca atômica do modelo de questionário ativo
--
--  O PROBLEMA
--  scripts/selecionar-modelo.mjs trocava o modelo ativo com um PATCH por
--  linha (desativa o antigo, ativa o novo). Se o script fosse
--  interrompido entre os dois PATCHes (rede caiu, Ctrl+C, processo
--  morreu), o instituto ficava sem NENHUM modelo ativo — e o totem
--  quebrava com um erro cru (TypeError), sem mensagem amigável.
--
--  A SAÍDA
--  Uma função que faz tudo num UPDATE só (uma transação, não dá pra
--  parar no meio). Chamada só pelo script de manutenção via
--  service_role — não é exposta pro app (nem admin, nem totem
--  precisam disso direto).
-- =============================================================

create or replace function selecionar_modelo(p_modelo_id uuid)
returns void
language plpgsql as $$
declare
  v_instituto uuid;
begin
  select instituto_id into v_instituto from modelo_pesquisa where id = p_modelo_id;
  if v_instituto is null then
    raise exception 'modelo % não encontrado', p_modelo_id;
  end if;

  update modelo_pesquisa
  set ativo = (id = p_modelo_id)
  where instituto_id = v_instituto;
end $$;

revoke all on function selecionar_modelo(uuid) from public, anon, authenticated;
