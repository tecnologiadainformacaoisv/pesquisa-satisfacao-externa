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
/* Vai tudo numa RPC (db/08): uma transação só, e o id é gerado AQUI.
   Isso torna o reenvio da fila offline idempotente — mandar duas vezes
   a mesma resposta não duplica métrica — e dispensa ler a linha de volta,
   coisa que o totem não pode fazer. */
export async function enviar(payload) {
  const id = payload.id || crypto.randomUUID();

  const { error } = await supabase.rpc('registrar_resposta', {
    p_id: id,
    p_unidade: payload.unidade_id,
    p_modelo: payload.modelo_id,
    p_origem: 'totem',
    p_itens: payload.itens.map((it) => ({
      pergunta_id: it.pergunta_id ?? null,
      tipo: it.tipo,
      valor_num: it.valor_num ?? null,
      valor_texto: it.valor_texto ?? null,
    })),
  });
  if (error) throw error;
  return id;
}

// -------- Fila offline (localStorage) --------
const FILA = 'isv_fila_v1';
const lerFila = () => { try { return JSON.parse(localStorage.getItem(FILA)) || []; } catch { return []; } };
const salvarFila = (f) => localStorage.setItem(FILA, JSON.stringify(f));

/* O id é carimbado ao enfileirar, não ao enviar: se a resposta for
   reenviada depois, vai com o MESMO id e a RPC ignora a repetição. */
export function enfileirar(payload) {
  const f = lerFila();
  f.push({ ...payload, id: payload.id || crypto.randomUUID() });
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
