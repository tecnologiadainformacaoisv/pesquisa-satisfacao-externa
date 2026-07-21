-- =============================================================
--  PRODUTO ISV — 04 · SEED de exemplo
--  Cria o instituto ISV com o INSTRUMENTO ATUAL (o que já roda hoje):
--  NPS + 4 estrelas (recepção, limpeza, atendimento, espera) + comentário.
--  Serve para validar o schema e as views antes da migração real.
--  Roda depois de 01, 02 e 03.
-- =============================================================

-- OBS.: este seed insere via SQL Editor, que roda como superusuário
-- (a RLS não bloqueia o owner do banco). Em produção, os dados vêm
-- pela aplicação (com Auth) ou pelo script de migração da planilha.

do $$
declare
  v_inst  uuid;
  v_mun   uuid;
  v_uni   uuid;
  v_mod   uuid;
begin
  -- Instituto ----------------------------------------------------
  insert into instituto (nome, slug, cor_acento)
  values ('Instituto São Vicente', 'isv', '#0B6E63')
  returning id into v_inst;

  -- Município + Unidade -----------------------------------------
  insert into municipio (instituto_id, nome, uf)
  values (v_inst, 'Caucaia', 'CE')
  returning id into v_mun;

  insert into unidade (instituto_id, municipio_id, nome, tipo)
  values (v_inst, v_mun, 'UBS Centro', 'UBS')
  returning id into v_uni;

  -- Dois modelos, mesmo instrumento, formatos diferentes de nota.
  -- Só um fica ativo por vez (ver scripts/selecionar-modelo.mjs); o app
  -- carrega sempre o que estiver com ativo=true.

  -- Modelo A (ativo) — instrumento atual do ISV: NPS + 4 estrelas + comentário
  insert into modelo_pesquisa (instituto_id, nome, descricao, coleta_demografia, ativo)
  values (v_inst, 'Satisfação do Paciente — ISV (estrelas)',
          'Instrumento em produção: NPS + 4 estrelas + comentário', false, true)
  returning id into v_mod;

  insert into pergunta (instituto_id, modelo_id, ordem, tipo, texto, obrigatoria) values
    (v_inst, v_mod, 1, 'nps',     'De 0 a 10, o quanto você recomendaria nossa unidade?', true),
    (v_inst, v_mod, 2, 'estrela', 'Recepção',    true),
    (v_inst, v_mod, 3, 'estrela', 'Limpeza',     true),
    (v_inst, v_mod, 4, 'estrela', 'Atendimento', true),
    (v_inst, v_mod, 5, 'estrela', 'Tempo de espera', true),
    (v_inst, v_mod, 6, 'texto',   'Quer deixar um comentário?', false);

  -- Modelo B (inativo por padrão) — mesma pergunta, com carinhas em vez de
  -- estrela (visual do mspesquisa original). Ativar com selecionar-modelo.mjs.
  declare v_mod_carinha uuid;
  begin
    insert into modelo_pesquisa (instituto_id, nome, descricao, coleta_demografia, ativo)
    values (v_inst, 'Satisfação do Paciente — ISV (carinhas)',
            'Variante com carinhas em vez de estrelas', false, false)
    returning id into v_mod_carinha;

    insert into pergunta (instituto_id, modelo_id, ordem, tipo, texto, obrigatoria) values
      (v_inst, v_mod_carinha, 1, 'nps',     'De 0 a 10, o quanto você recomendaria nossa unidade?', true),
      (v_inst, v_mod_carinha, 2, 'carinha', 'Recepção',    true),
      (v_inst, v_mod_carinha, 3, 'carinha', 'Limpeza',     true),
      (v_inst, v_mod_carinha, 4, 'carinha', 'Atendimento', true),
      (v_inst, v_mod_carinha, 5, 'carinha', 'Tempo de espera', true),
      (v_inst, v_mod_carinha, 6, 'texto',   'Quer deixar um comentário?', false);
  end;

  -- Uma resposta de exemplo (para as views retornarem algo) -----
  declare v_resp uuid;
  begin
    insert into resposta (instituto_id, unidade_id, modelo_id, origem)
    values (v_inst, v_uni, v_mod, 'totem')
    returning id into v_resp;

    insert into resposta_item (instituto_id, resposta_id, tipo, valor_num, valor_texto)
    select v_inst, v_resp, p.tipo,
           case when p.tipo = 'nps' then 9
                when p.tipo in ('estrela','carinha') then 5
                else null end,
           case when p.tipo = 'texto' then 'Atendimento muito bom, parabéns!' else null end
    from pergunta p where p.modelo_id = v_mod;
  end;

  raise notice 'Seed ISV criado. instituto_id = %', v_inst;
end $$;

-- Confira:
--   select * from vw_satisfacao_unidade_mes;
--   select * from vw_nps_unidade_mes;
--   select * from vw_comentarios;

-- =============================================================
--  Fim do 04_seed_exemplo.sql
-- =============================================================
