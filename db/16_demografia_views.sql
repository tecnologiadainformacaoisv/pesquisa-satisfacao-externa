-- =============================================================
--  PRODUTO ISV — 16 · Views de NPS por turno e por faixa etária
--  (Fase 2, Stage B — demografia opcional coletada desde o 12/15)
--  Rode no SQL Editor.
--
--  Mesmo padrão do vw_nps_unidade_mes (03_views.sql), só que agrupando
--  por turno/faixa_etaria em vez de unidade/mês. Respostas antigas (antes
--  da coleta de demografia existir) ou onde a pessoa pulou a pergunta
--  ficam de fora (turno/faixa_etaria null) — não dá pra classificar o
--  que não foi informado.
-- =============================================================

create or replace view vw_nps_turno
with (security_invoker = true) as
select
  r.instituto_id,
  r.turno,
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
where i.tipo = 'nps' and r.turno is not null
group by r.instituto_id, r.turno;

create or replace view vw_nps_faixa_etaria
with (security_invoker = true) as
select
  r.instituto_id,
  r.faixa_etaria,
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
where i.tipo = 'nps' and r.faixa_etaria is not null
group by r.instituto_id, r.faixa_etaria;

-- =============================================================
--  Fim do 16_demografia_views.sql
-- =============================================================
