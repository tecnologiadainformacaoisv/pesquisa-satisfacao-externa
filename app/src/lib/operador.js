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

export function slugify(nome) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // tira acento
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* INSERT passa pela RLS normal (instituto_mod, db/02_rls.sql) — só
   is_super_admin() consegue criar um instituto novo (pra qualquer outro
   papel, o WITH CHECK exige id = current_instituto_id(), que uma linha
   nova nunca satisfaz). Não precisa de service_role: é o próprio operador
   logado criando, com o supabase-js normal. */
export async function criarInstituto({ nome, slug, cor }) {
  const { data, error } = await supabase
    .from('instituto')
    .insert([{ nome, slug, cor_acento: cor }])
    .select('id, nome, cor_acento')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`Já existe um instituto com o identificador "${slug}". Tente outro nome.`);
    throw new Error(error.message);
  }
  return data;
}

export async function atualizarInstituto(id, { nome, cor }) {
  const { data, error } = await supabase.from('instituto')
    .update({ nome, cor_acento: cor }).eq('id', id).select('id, nome, cor_acento').single();
  if (error) throw new Error(error.message);
  return data;
}

/* Tudo abaixo passa pela mesma RLS (municipio_mod/unidade_mod/modelo_mod/
   pergunta_mod, db/02_rls.sql) — is_super_admin() já bypassa o
   instituto_id=current_instituto_id() que travaria qualquer outro papel,
   então o operador consegue cadastrar em QUALQUER instituto sem
   service_role, só com a própria sessão logada. */

export async function carregarDetalhesInstituto(institutoId) {
  const [municipios, unidades, modelos] = await Promise.all([
    supabase.from('municipio').select('id, nome, uf').eq('instituto_id', institutoId).order('nome').then((r) => r.data || []),
    supabase.from('unidade').select('id, nome, tipo, municipio_id').eq('instituto_id', institutoId).order('nome').then((r) => r.data || []),
    supabase.from('modelo_pesquisa').select('id, nome, ativo').eq('instituto_id', institutoId).order('criado_em').then((r) => r.data || []),
  ]);
  let perguntas = [];
  if (modelos.length) {
    perguntas = await supabase.from('pergunta').select('id, modelo_id, ordem, tipo, texto, obrigatoria')
      .in('modelo_id', modelos.map((m) => m.id)).order('ordem').then((r) => r.data || []);
  }
  return { municipios, unidades, modelos, perguntas };
}

export async function criarMunicipio({ instituto_id, nome, uf }) {
  const { data, error } = await supabase.from('municipio')
    .insert([{ instituto_id, nome, uf: uf || null }]).select('id, nome, uf').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarMunicipio(id, { nome, uf }) {
  const { data, error } = await supabase.from('municipio')
    .update({ nome, uf: uf || null }).eq('id', id).select('id, nome, uf').single();
  if (error) throw new Error(error.message);
  return data;
}

/* on delete cascade em unidade.municipio_id — apagar um município leva as
   unidades dele junto. O aviso de confirmação (na tela) é o que impede o
   clique acidental; aqui não duplicamos essa checagem. */
export async function excluirMunicipio(id) {
  const { error } = await supabase.from('municipio').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function criarUnidade({ instituto_id, municipio_id, nome, tipo }) {
  const { data, error } = await supabase.from('unidade')
    .insert([{ instituto_id, municipio_id, nome, tipo: tipo || null }]).select('id, nome, tipo, municipio_id').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarUnidade(id, { nome, tipo, municipio_id }) {
  const { data, error } = await supabase.from('unidade')
    .update({ nome, tipo: tipo || null, municipio_id }).eq('id', id).select('id, nome, tipo, municipio_id').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function excluirUnidade(id) {
  const { error } = await supabase.from('unidade').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function criarModeloPesquisa({ instituto_id, nome }) {
  const { data, error } = await supabase.from('modelo_pesquisa')
    .insert([{ instituto_id, nome, ativo: true }]).select('id, nome, ativo').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function criarPergunta({ instituto_id, modelo_id, ordem, tipo, texto, obrigatoria }) {
  const { data, error } = await supabase.from('pergunta')
    .insert([{ instituto_id, modelo_id, ordem, tipo, texto, obrigatoria }])
    .select('id, ordem, tipo, texto, obrigatoria').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarPergunta(id, { texto, tipo, obrigatoria }) {
  const { data, error } = await supabase.from('pergunta')
    .update({ texto, tipo, obrigatoria }).eq('id', id).select('id, ordem, tipo, texto, obrigatoria').single();
  if (error) throw new Error(error.message);
  return data;
}

/* pergunta_id em resposta_item é "on delete set null" (db/01_schema.sql) —
   apagar uma pergunta NÃO apaga respostas já dadas, só desvincula o
   histórico daquela pergunta especifica (mantém tipo/valor). */
export async function excluirPergunta(id) {
  const { error } = await supabase.from('pergunta').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
