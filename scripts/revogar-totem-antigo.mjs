/* Revoga o usuário totem@... compartilhado (criado por criar-totem.mjs,
   agora obsoleto — ver db/10_pareamento_totem.sql). Trocar a senha não
   basta: ela já foi impressa no bundle de produção mais de uma vez.
   A única forma de matar de vez uma senha vazada é apagar a conta.
   Uso: node produto-isv/scripts/revogar-totem-antigo.mjs */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dir, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE || '';
if (!URL || !KEY) { console.error('ERRO: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE no .env'); process.exit(1); }

const EMAIL = 'totem@institutosaovicente.com.br';
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const lista = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers: h }).then((r) => r.json());
const achado = (lista.users || []).find((u) => u.email === EMAIL);
if (!achado) { console.log('Nenhum usuário totem@... compartilhado encontrado — nada a revogar.'); process.exit(0); }

const del = await fetch(`${URL}/auth/v1/admin/users/${achado.id}`, { method: 'DELETE', headers: h });
if (del.ok) {
  console.log(`Conta ${EMAIL} removida (id ${achado.id}).`);
  console.log('O usuario_perfil correspondente foi junto (on delete cascade).');
  console.log('A partir de agora, cada tablet pareia com um código próprio — ver gerar-codigo-totem.mjs.');
} else {
  console.error('Falha ao remover:', del.status, await del.text());
  process.exit(1);
}
