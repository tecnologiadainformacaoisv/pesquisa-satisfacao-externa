import { supabase } from './supabase';

// -------- Autenticação do totem (uma vez; sessão persiste) --------
export async function entrarComoTotem() {
  const { data: s } = await supabase.auth.getSession();
  if (s?.session) return s.session;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: import.meta.env.VITE_TOTEM_EMAIL,
    password: import.meta.env.VITE_TOTEM_PASSWORD,
  });
  if (error) throw new Error('Falha no login do totem: ' + error.message);
  return data.session;
}

// -------- Carrega o instituto/unidade/modelo/perguntas via RLS --------
export async function carregarConfig() {
  const { data: perfil, error: ep } = await supabase
    .from('usuario_perfil').select('instituto_id, unidade_id').single();
  if (ep) throw new Error('Perfil do totem não encontrado: ' + ep.message);

  const { data: instituto } = await supabase
    .from('instituto').select('id, nome, cor_acento').single();

  const { data: unidade } = await supabase
    .from('unidade').select('id, nome').eq('id', perfil.unidade_id).single();

  const { data: modelo } = await supabase
    .from('modelo_pesquisa').select('id, nome')
    .order('criado_em', { ascending: true }).limit(1).single();

  const { data: perguntas, error: eq } = await supabase
    .from('pergunta').select('id, ordem, tipo, texto, obrigatoria')
    .eq('modelo_id', modelo.id).eq('ativo', true).order('ordem', { ascending: true });
  if (eq) throw new Error('Perguntas não carregadas: ' + eq.message);

  return { instituto, unidade, modelo, perguntas };
}

// -------- Gravação de uma resposta (+ itens) --------
export async function enviar(payload) {
  const { data: resp, error } = await supabase
    .from('resposta')
    .insert({
      instituto_id: payload.instituto_id,
      unidade_id: payload.unidade_id,
      modelo_id: payload.modelo_id,
      origem: 'totem',
    })
    .select('id').single();
  if (error) throw error;

  const linhas = payload.itens.map((it) => ({
    instituto_id: payload.instituto_id,
    resposta_id: resp.id,
    pergunta_id: it.pergunta_id,
    tipo: it.tipo,
    valor_num: it.valor_num ?? null,
    valor_texto: it.valor_texto ?? null,
  }));
  const { error: e2 } = await supabase.from('resposta_item').insert(linhas);
  if (e2) throw e2;
  return resp.id;
}

// -------- Fila offline (localStorage) --------
const FILA = 'isv_fila_v1';
const lerFila = () => { try { return JSON.parse(localStorage.getItem(FILA)) || []; } catch { return []; } };
const salvarFila = (f) => localStorage.setItem(FILA, JSON.stringify(f));

export function enfileirar(payload) {
  const f = lerFila();
  f.push(payload);
  salvarFila(f);
}
export const pendentes = () => lerFila().length;

export async function tentarEnviarFila() {
  const fila = lerFila();
  if (!fila.length) return 0;
  const restantes = [];
  for (const item of fila) {
    try { await enviar(item); } catch { restantes.push(item); }
  }
  salvarFila(restantes);
  return fila.length - restantes.length;
}
