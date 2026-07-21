import { supabase } from './supabase';

/* Todas as leituras passam pela RLS: o gestor só enxerga o próprio instituto. */

export async function carregarTudo() {
  const [instituto, unidades, nps, satisfacao, distribuicao, comentarios] = await Promise.all([
    supabase.from('instituto').select('id, nome').single().then((r) => r.data),
    supabase.from('unidade').select('id, nome, ativo').order('nome').then((r) => r.data || []),
    supabase.from('vw_nps_unidade_mes')
      .select('unidade_id, unidade_nome, mes, total, promotores, neutros, detratores, nps')
      .order('mes').then((r) => r.data || []),
    supabase.from('vw_satisfacao_unidade_mes')
      .select('unidade_id, unidade_nome, mes, total_itens, itens_satisfeitos, indice_satisfacao')
      .order('mes').then((r) => r.data || []),
    supabase.from('vw_distribuicao_pergunta')
      .select('pergunta_id, pergunta, tipo, nota, quantidade').then((r) => r.data || []),
    supabase.from('vw_comentarios')
      .select('unidade_id, unidade_nome, criado_em, comentario').limit(50).then((r) => r.data || []),
  ]);
  return { instituto, unidades, nps, satisfacao, distribuicao, comentarios };
}

// --------- agregações no cliente (filtro por unidade) ---------
const soma = (arr, campo) => arr.reduce((a, x) => a + (Number(x[campo]) || 0), 0);

export function resumo({ nps, satisfacao }, unidadeId) {
  const n = unidadeId ? nps.filter((r) => r.unidade_id === unidadeId) : nps;
  const s = unidadeId ? satisfacao.filter((r) => r.unidade_id === unidadeId) : satisfacao;

  const totalNps = soma(n, 'total');
  const prom = soma(n, 'promotores');
  const det = soma(n, 'detratores');
  const neu = soma(n, 'neutros');
  const npsGeral = totalNps ? Math.round(((prom - det) / totalNps) * 1000) / 10 : null;

  const itens = soma(s, 'total_itens');
  const satisfeitos = soma(s, 'itens_satisfeitos');
  const indice = itens ? Math.round((satisfeitos / itens) * 1000) / 10 : null;

  return { respostas: totalNps, npsGeral, prom, neu, det, indice, itens };
}

/** NPS agregado por unidade (todas as competências somadas). */
export function npsPorUnidade(nps) {
  const m = new Map();
  for (const r of nps) {
    const k = r.unidade_id;
    const a = m.get(k) || { unidade: r.unidade_nome, total: 0, prom: 0, det: 0 };
    a.total += Number(r.total) || 0;
    a.prom += Number(r.promotores) || 0;
    a.det += Number(r.detratores) || 0;
    m.set(k, a);
  }
  return [...m.values()]
    .map((a) => ({ ...a, nps: a.total ? Math.round(((a.prom - a.det) / a.total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.nps - a.nps);
}

/** Índice de satisfação por mês (série temporal). */
export function satisfacaoPorMes(satisfacao, unidadeId) {
  const base = unidadeId ? satisfacao.filter((r) => r.unidade_id === unidadeId) : satisfacao;
  const m = new Map();
  for (const r of base) {
    const a = m.get(r.mes) || { mes: r.mes, itens: 0, sat: 0 };
    a.itens += Number(r.total_itens) || 0;
    a.sat += Number(r.itens_satisfeitos) || 0;
    m.set(r.mes, a);
  }
  return [...m.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((a) => ({ mes: a.mes, indice: a.itens ? Math.round((a.sat / a.itens) * 1000) / 10 : 0 }));
}

/** Média por pergunta (só perguntas com nota). */
export function mediaPorPergunta(distribuicao) {
  const m = new Map();
  for (const r of distribuicao) {
    if (r.nota == null) continue;
    const a = m.get(r.pergunta_id) || { pergunta: r.pergunta || '(sem título)', tipo: r.tipo, n: 0, soma: 0 };
    a.n += Number(r.quantidade) || 0;
    a.soma += Number(r.nota) * (Number(r.quantidade) || 0);
    m.set(r.pergunta_id, a);
  }
  return [...m.values()]
    .map((a) => ({ ...a, media: a.n ? Math.round((a.soma / a.n) * 10) / 10 : 0, max: a.tipo === 'nps' ? 10 : 5 }))
    .sort((a, b) => b.media / b.max - a.media / a.max);
}
