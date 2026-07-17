-- =============================================================
--  PRODUTO ISV — 03 · VIEWS de agregação (relatórios)
--  As views herdam a RLS das tabelas-base (security_invoker),
--  então cada instituto só agrega os próprios dados.
-- =============================================================

-- -------------------------------------------------------------
--  Índice de Satisfação — perguntas tipo 'estrela' e 'carinha' (1–5)
--  Regra (herdada do mspesquisa): satisfeito = nota >= 3
--  (Bom + Muito Bom + Excelente). Agrega por unidade e mês.
-- -------------------------------------------------------------
create or replace view vw_satisfacao_unidade_mes
with (security_invoker = true) as
select
  r.instituto_id,
  r.unidade_id,
  u.nome                                   as unidade_nome,
  date_trunc('month', r.criado_em)::date   as mes,
  count(*)                                 as total_itens,
  count(*) filter (where i.valor_num >= 3) as itens_satisfeitos,
  round(
    100.0 * count(*) filter (where i.valor_num >= 3) / nullif(count(*), 0)
  , 1)                                     as indice_satisfacao
from resposta_item i
join resposta r on r.id = i.resposta_id
join unidade  u on u.id = r.unidade_id
where i.tipo in ('estrela', 'carinha')
group by r.instituto_id, r.unidade_id, u.nome, date_trunc('month', r.criado_em);

-- -------------------------------------------------------------
--  NPS — perguntas tipo 'nps' (0–10), por unidade e mês
--  Promotor 9–10 · Neutro 7–8 · Detrator 0–6
--  NPS = %promotores − %detratores  (−100 a +100)
-- -------------------------------------------------------------
create or replace view vw_nps_unidade_mes
with (security_invoker = true) as
select
  r.instituto_id,
  r.unidade_id,
  u.nome                                              as unidade_nome,
  date_trunc('month', r.criado_em)::date              as mes,
  count(*)                                            as total,
  count(*) filter (where i.valor_num >= 9)            as promotores,
  count(*) filter (where i.valor_num between 7 and 8) as neutros,
  count(*) filter (where i.valor_num <= 6)            as detratores,
  round(
    100.0 * count(*) filter (where i.valor_num >= 9) / nullif(count(*),0)
    - 100.0 * count(*) filter (where i.valor_num <= 6) / nullif(count(*),0)
  , 1)                                                as nps
from resposta_item i
join resposta r on r.id = i.resposta_id
join unidade  u on u.id = r.unidade_id
where i.tipo = 'nps'
group by r.instituto_id, r.unidade_id, u.nome, date_trunc('month', r.criado_em);

-- -------------------------------------------------------------
--  Distribuição de notas por pergunta (para os gráficos de barras)
-- -------------------------------------------------------------
create or replace view vw_distribuicao_pergunta
with (security_invoker = true) as
select
  i.instituto_id,
  i.pergunta_id,
  p.texto        as pergunta,
  i.tipo,
  i.valor_num    as nota,
  count(*)       as quantidade
from resposta_item i
left join pergunta p on p.id = i.pergunta_id
where i.valor_num is not null
group by i.instituto_id, i.pergunta_id, p.texto, i.tipo, i.valor_num;

-- -------------------------------------------------------------
--  Comentários livres (para leitura qualitativa no painel)
-- -------------------------------------------------------------
create or replace view vw_comentarios
with (security_invoker = true) as
select
  i.instituto_id,
  r.unidade_id,
  u.nome         as unidade_nome,
  r.criado_em,
  i.valor_texto  as comentario
from resposta_item i
join resposta r on r.id = i.resposta_id
join unidade  u on u.id = r.unidade_id
where i.tipo = 'texto' and coalesce(trim(i.valor_texto), '') <> ''
order by r.criado_em desc;

-- =============================================================
--  Fim do 03_views.sql
-- =============================================================
