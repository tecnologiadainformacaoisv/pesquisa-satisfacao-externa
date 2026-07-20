/* Gera um código de pareamento de uso único para um tablet do totem.
   O TI digita este código, uma vez, direto no aparelho — nenhuma
   credencial fica salva no código-fonte ou no bundle do app.
   Uso: node produto-isv/scripts/gerar-codigo-totem.mjs "UBS Centro" [minutos=30] */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dir, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE || '';
if (!URL || !KEY) { console.error('ERRO: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE no .env'); process.exit(1); }

const UNIDADE = process.argv[2] || 'UBS Centro';
const MINUTOS = Number(process.argv[3]) || 30;

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = (path) => fetch(`${URL}/rest/v1/${path}`, { headers: h }).then((r) => r.json());

const [inst] = await rest('instituto?slug=eq.isv&select=id');
if (!inst) { console.error('Instituto ISV não encontrado (rode 04_seed_exemplo.sql).'); process.exit(1); }
const [uni] = await rest(`unidade?instituto_id=eq.${inst.id}&nome=eq.${encodeURIComponent(UNIDADE)}&select=id,nome`);
if (!uni) { console.error(`Unidade "${UNIDADE}" não encontrada no ISV.`); process.exit(1); }

// alfabeto sem 0/O/1/I/L — evita confusão de quem vai digitar na tela
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const gerarCodigo = () =>
  Array.from(randomBytes(8), (b) => ALFABETO[b % ALFABETO.length]).join('');

let codigo, tentativas = 0;
let criado = null;
while (!criado && tentativas < 5) {
  codigo = gerarCodigo();
  const expira = new Date(Date.now() + MINUTOS * 60_000).toISOString();
  const r = await fetch(`${URL}/rest/v1/totem_pareamento`, {
    method: 'POST', headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify([{ instituto_id: inst.id, unidade_id: uni.id, codigo, expira_em: expira }]),
  });
  if (r.status === 201) criado = (await r.json())[0];
  else if (r.status === 409) tentativas++;   // colisão rara de código — tenta outro
  else { console.error('Falha ao gravar o código:', r.status, await r.text()); process.exit(1); }
}
if (!criado) { console.error('Não foi possível gerar um código único, tente de novo.'); process.exit(1); }

console.log('\n===================================================');
console.log(' CÓDIGO DE PAREAMENTO DO TOTEM');
console.log('---------------------------------------------------');
console.log(' Unidade :', uni.nome);
console.log(' Código  :', codigo);
console.log(' Válido  :', MINUTOS, 'minutos (uso único)');
console.log('===================================================');
console.log('Digite este código na tela do tablet agora — ele expira');
console.log('em', MINUTOS, 'minutos e só funciona uma vez.');
