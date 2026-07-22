/* Troca qual questionário está ativo pro totem (só um modelo pode estar
   ativo por vez — é o app/src/lib/isv.js:carregarConfig que filtra por
   ativo=true). Substitui, por enquanto, a tela de admin que ainda não existe
   (Fase 2 do plano de produto).
   Uso: node produto-isv/scripts/selecionar-modelo.mjs           (lista os modelos)
        node produto-isv/scripts/selecionar-modelo.mjs "estrelas" (ativa o que contém esse texto no nome) */

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

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = (path, opts = {}) => fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { ...h, Prefer: 'return=representation', ...(opts.headers || {}) } });

const termo = process.argv[2];
const modelos = await (await rest('modelo_pesquisa?select=id,nome,ativo&order=criado_em')).json();

if (!termo) {
  console.log('\nModelos do ISV:');
  modelos.forEach((m) => console.log(`  ${m.ativo ? '✓ ATIVO' : '       '}  ${m.nome}`));
  console.log('\nPra trocar: node scripts/selecionar-modelo.mjs "parte do nome"');
} else {
  const alvo = modelos.find((m) => m.nome.toLowerCase().includes(termo.toLowerCase()));
  if (!alvo) {
    console.error(`Nenhum modelo com "${termo}" no nome.`);
  } else {
    // RPC (db/11) faz tudo num UPDATE só — não tem como parar no meio e
    // deixar o instituto sem nenhum modelo ativo (o que um PATCH por linha
    // permitia se o script fosse interrompido entre um e outro).
    const r = await rest('rpc/selecionar_modelo', {
      method: 'POST',
      body: JSON.stringify({ p_modelo_id: alvo.id }),
    });
    if (!r.ok) {
      console.error('falha ao trocar de modelo:', r.status, await r.text());
    } else {
      console.log(`\n✓ Ativo agora: ${alvo.nome}`);
      console.log('(o totem pega o modelo novo na próxima vez que a página carregar)');
    }
  }
}
