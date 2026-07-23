import { supabase } from './supabase';

/* -------- Sessão + pareamento do totem --------
   Nenhuma credencial vive no bundle. O aparelho entra ANÔNIMO (sem
   usuario_perfil, não passa em nenhuma política de escrita) e só vira
   'totem' de verdade depois que alguém digita, uma vez, um código de
   uso único gerado pelo TI (scripts/gerar-codigo-totem.mjs). Depois
   disso a sessão persiste no localStorage do próprio aparelho.
   Ver db/10_pareamento_totem.sql para o porquê. */

/* Guarda a Promise em voo: o React.StrictMode (dev) dispara o efeito de
   inicialização 2x de propósito, e duas chamadas concorrentes aqui criavam
   DUAS identidades anônimas diferentes (2x signInAnonymously) na mesma carga
   de página — o pareamento ficava preso a uma, e o app seguia com a outra. */
let sessaoEmVoo = null;

export async function sessaoAtiva() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  if (!sessaoEmVoo) {
    sessaoEmVoo = supabase.auth.signInAnonymously().then(({ data: anon, error }) => {
      if (error) throw new Error('Falha ao iniciar sessão do totem: ' + error.message);
      return anon.session;
    });
  }
  return sessaoEmVoo;
}

export async function parear(codigo) {
  const { data, error } = await supabase.rpc('parear_totem', { p_codigo: codigo });
  if (error) throw new Error(traduzErroPareamento(error.message));
  return data; // { instituto, unidade }
}

function traduzErroPareamento(msg) {
  if (msg?.includes('invalido ou expirado')) return 'Código inválido ou expirado. Peça um código novo.';
  return 'Não foi possível parear este totem: ' + msg;
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

  const { data: modelo, error: em } = await supabase
    .from('modelo_pesquisa').select('id, nome, coleta_demografia')
    .eq('ativo', true).order('criado_em', { ascending: true }).limit(1).single();
  if (em) throw new Error('Nenhum questionário ativo configurado para este instituto: ' + em.message);

  const { data: perguntas, error: eq } = await supabase
    .from('pergunta').select('id, ordem, tipo, texto, obrigatoria')
    .eq('modelo_id', modelo.id).eq('ativo', true).order('ordem', { ascending: true });
  if (eq) throw new Error('Perguntas não carregadas: ' + eq.message);

  return { instituto, unidade, modelo, perguntas };
}

// -------- Demografia opcional (Fase 2) --------
/* Turno nunca é perguntado — vem do relógio do próprio aparelho no
   momento do envio, igual o mspesquisa original fazia. Faixa etária é
   a única pergunta de fato (e só aparece se modelo.coleta_demografia
   estiver ligado — ver ColetaTotem.jsx). */
export function turnoAtual() {
  const hora = new Date().getHours();
  return (hora >= 6 && hora < 18) ? 'dia' : 'noite';
}

// -------- Gravação de uma resposta (+ itens) --------
/* Vai tudo numa RPC (db/08 + db/12), uma transação só, e o id é gerado
   AQUI. Isso torna o reenvio da fila offline idempotente — mandar duas
   vezes a mesma resposta não duplica métrica — e dispensa ler a linha
   de volta, coisa que o totem não pode fazer. */
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
    p_faixa_etaria: payload.faixa_etaria ?? null,
    p_turno: payload.turno ?? null,
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
