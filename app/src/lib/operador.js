import { supabase } from './supabase';

/* Visão cross-instituto do dono do SaaS (papel='admin', instituto_id=null
   em usuario_perfil — ver db/01_schema.sql e is_super_admin() em
   db/02_rls.sql). As views já trazem instituto_id porque herdam a RLS das
   tabelas-base (security_invoker) — um super admin vê todo mundo, então as
   mesmas views servem pra agregar por instituto em vez de só por unidade. */

export async function carregarVisaoGeral() {
  const [institutos, municipios, unidades, nps, satisfacao] = await Promise.all([
    supabase.from('instituto').select('id, nome, cor_acento').order('nome').then((r) => r.data || []),
    supabase.from('municipio').select('id, instituto_id').then((r) => r.data || []),
    supabase.from('unidade').select('id, instituto_id, ativo').then((r) => r.data || []),
    supabase.from('vw_nps_unidade_mes').select('instituto_id, total, promotores, neutros, detratores').then((r) => r.data || []),
    supabase.from('vw_satisfacao_unidade_mes').select('instituto_id, total_itens, itens_satisfeitos').then((r) => r.data || []),
  ]);
  return { institutos, municipios, unidades, nps, satisfacao };
}

const soma = (arr, campo) => arr.reduce((a, x) => a + (Number(x[campo]) || 0), 0);

/** Uma linha por instituto: unidades, respostas, NPS médio, índice de satisfação médio. */
export function resumoPorInstituto({ institutos, municipios, unidades, nps, satisfacao }) {
  return institutos.map((inst) => {
    const n = nps.filter((r) => r.instituto_id === inst.id);
    const s = satisfacao.filter((r) => r.instituto_id === inst.id);

    const totalNps = soma(n, 'total');
    const prom = soma(n, 'promotores');
    const det = soma(n, 'detratores');
    const npsGeral = totalNps ? Math.round(((prom - det) / totalNps) * 1000) / 10 : null;

    const itens = soma(s, 'total_itens');
    const satisfeitos = soma(s, 'itens_satisfeitos');
    const indice = itens ? Math.round((satisfeitos / itens) * 1000) / 10 : null;

    return {
      id: inst.id,
      nome: inst.nome,
      cor: inst.cor_acento || '#0B6E63',
      municipios: municipios.filter((m) => m.instituto_id === inst.id).length,
      unidades: unidades.filter((u) => u.instituto_id === inst.id).length,
      respostas: totalNps,
      nps: npsGeral,
      indice,
    };
  });
}

/** Totais gerais (o topo da tela: contadores macro). */
export function totaisGerais({ institutos, municipios, unidades, nps }) {
  return {
    institutos: institutos.length,
    municipios: municipios.length,
    unidades: unidades.length,
    respostas: soma(nps, 'total'),
  };
}
