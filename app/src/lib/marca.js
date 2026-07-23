import { supabase } from './supabase';

/* Branding por instituto (Fase 3): cor e logo existiam na tabela desde
   o dia 1 mas nunca eram aplicados na tela — todo instituto ficava com
   a cara do ISV. Estas funções são usadas pelo totem, pelo painel do
   instituto e pela tela de entrada (via ?i=slug). */

export function iniciais(nome) {
  if (!nome) return 'ISV';
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 3).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Escurece uma cor hex (#RRGGBB) em `pct` (0–1) — usado pro hover/estado ativo. */
export function escurecer(hex, pct = 0.12) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const canal = (deslocamento) => {
    const v = (n >> deslocamento) & 0xff;
    return Math.max(0, Math.round(v * (1 - pct)));
  };
  return `#${[canal(16), canal(8), canal(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Estilo inline (custom properties --accent/--accent-d) pra por na raiz da tela. */
export function estiloAcento(corAcento) {
  if (!corAcento) return undefined;
  return { '--accent': corAcento, '--accent-d': escurecer(corAcento) };
}

/** Branding público (slug, nome, logo_url, cor_acento) — sem login, usado
   pela tela de entrada quando aberta com ?i=<slug> (link direto do instituto). */
export async function institutoPublicoPorSlug(slug) {
  if (!slug) return null;
  const { data } = await supabase
    .from('vw_instituto_publico').select('slug, nome, logo_url, cor_acento')
    .eq('slug', slug).single();
  return data || null;
}
