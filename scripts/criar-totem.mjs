/* Cria (ou reaproveita) o usuário 'totem' do ISV e o vincula a uma unidade.
   O tablet faz login com essas credenciais para gravar respostas.
   Papel 'totem' só INSERE respostas (não lê) — ver 06_rls_totem.sql.
   Uso: node produto-isv/scripts/criar-totem.mjs [nome-da-unidade] */

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
const EMAIL = 'totem@institutosaovicente.com.br';

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(path) { return fetch(`${URL}/rest/v1/${path}`, { headers: h }).then(r => r.json()); }

// instituto + unidade
const [inst] = await rest('instituto?slug=eq.isv&select=id');
if (!inst) { console.error('Instituto ISV não encontrado (rode 04_seed_exemplo.sql).'); process.exit(1); }
const [uni] = await rest(`unidade?instituto_id=eq.${inst.id}&nome=eq.${encodeURIComponent(UNIDADE)}&select=id,nome`);
if (!uni) { console.error(`Unidade "${UNIDADE}" não encontrada no ISV.`); process.exit(1); }

// cria o usuário auth (admin API); se já existir, gera nova senha
const senha = randomBytes(9).toString('base64url'); // ~12 chars
let userId;
const criar = await fetch(`${URL}/auth/v1/admin/users`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ email: EMAIL, password: senha, email_confirm: true }),
}).then(r => r.json());

if (criar.id) {
  userId = criar.id;
  console.log('Usuário totem criado.');
} else {
  // já existe → localiza e reseta a senha
  const lista = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers: h }).then(r => r.json());
  const achado = (lista.users || []).find(u => u.email === EMAIL);
  if (!achado) { console.error('Falha ao criar/achar o usuário:', JSON.stringify(criar)); process.exit(1); }
  userId = achado.id;
  await fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT', headers: h, body: JSON.stringify({ password: senha }),
  });
  console.log('Usuário totem já existia — senha redefinida.');
}

// perfil (papel totem, vinculado à unidade). service_role ignora RLS.
await fetch(`${URL}/rest/v1/usuario_perfil`, {
  method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{
    id: userId, instituto_id: inst.id, nome: `Totem — ${uni.nome}`,
    papel: 'totem', unidade_id: uni.id, ativo: true,
  }]),
});

console.log('\n===================================================');
console.log(' CREDENCIAIS DO TOTEM (para o .env do app)');
console.log('---------------------------------------------------');
console.log(' Unidade :', uni.nome);
console.log(' E-mail  :', EMAIL);
console.log(' Senha   :', senha);
console.log('===================================================');
console.log('Guarde a senha: ela só aparece agora.');
