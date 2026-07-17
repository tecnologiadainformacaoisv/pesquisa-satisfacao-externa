/* Prova de ponta a ponta da RLS: faz login como o admin do ISV e confirma
   que, autenticado, ele PASSA a enxergar os dados do próprio instituto.
   Uso: node produto-isv/scripts/verificar-login.mjs
   Lê SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TEST_EMAIL, SUPABASE_TEST_PASSWORD de .env */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of readFileSync(join(__dir, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { console.error('ERRO: .env não encontrado.'); process.exit(1); }

const URL  = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY || '';
const EMAIL = env.SUPABASE_TEST_EMAIL || '';
const PASS  = env.SUPABASE_TEST_PASSWORD || '';

if (!URL || !ANON || !EMAIL || !PASS) {
  console.error('ERRO: preencha SUPABASE_TEST_EMAIL e SUPABASE_TEST_PASSWORD no .env');
  process.exit(1);
}

console.log('\n==============================================');
console.log(' PROVA DE RLS — login como', EMAIL);
console.log('==============================================\n');

// 1) Login (grant_type=password) → obtém o access_token do usuário
const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
}).then(r => r.json());

if (!login.access_token) {
  console.error('FALHA no login:', login.error_description || login.msg || JSON.stringify(login));
  console.error('(confirme e-mail/senha e se o usuário está "confirmed" no painel)');
  process.exit(1);
}
console.log('[1] Login OK — token obtido.\n');
const auth = { apikey: ANON, Authorization: `Bearer ${login.access_token}` };

// 2) Autenticado, deve ENXERGAR o próprio instituto (RLS libera)
async function ler(nome, campos) {
  const r = await fetch(`${URL}/rest/v1/${nome}?select=${campos}`, { headers: auth });
  return r.json();
}

const inst = await ler('instituto', 'nome,slug');
const uni  = await ler('unidade', 'nome,tipo');
const nps  = await ler('vw_nps_unidade_mes', 'unidade_nome,nps,total');

console.log('[2] Leitura via RLS (autenticado):');
console.log('    institutos visíveis :', inst.map?.(i => i.nome).join(', ') || '(nenhum)');
console.log('    unidades visíveis   :', uni.map?.(u => u.nome).join(', ') || '(nenhuma)');
if (Array.isArray(nps) && nps.length) {
  for (const r of nps) console.log(`    NPS ${r.unidade_nome}: ${r.nps} (${r.total} resp.)`);
} else {
  console.log('    NPS: (vazio — rode o 04_seed_exemplo.sql)');
}

console.log('\n----------------------------------------------');
const ok = Array.isArray(inst) && inst.length === 1 && inst[0].slug === 'isv';
if (ok) {
  console.log(' RESULTADO: RLS validada de ponta a ponta.');
  console.log(' O admin logado vê o instituto ISV — e só ele.');
} else {
  console.log(' ATENÇÃO: leitura inesperada — ver acima.');
  process.exitCode = 1;
}
console.log('----------------------------------------------\n');
