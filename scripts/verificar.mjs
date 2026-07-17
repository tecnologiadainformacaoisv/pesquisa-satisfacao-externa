/* Verifica a conexão com o Supabase e o estado do schema.
   Uso: node produto-isv/scripts/verificar.mjs
   Lê as variáveis de produto-isv/.env (não precisa de dependências). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '..', '.env');

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.error('ERRO: não achei o arquivo .env em', path);
    console.error('Copie .env.example para .env e preencha SUPABASE_URL e SUPABASE_ANON_KEY.');
    process.exit(1);
  }
  return env;
}

const env = loadEnv(envPath);
const URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY || '';
const SERVICE = env.SUPABASE_SERVICE_ROLE || '';

if (!URL || !ANON) {
  console.error('ERRO: preencha SUPABASE_URL e SUPABASE_ANON_KEY no .env');
  process.exit(1);
}

const TABELAS = ['instituto','municipio','unidade','usuario_perfil',
                 'modelo_pesquisa','pergunta','resposta','resposta_item'];
const VIEWS = ['vw_satisfacao_unidade_mes','vw_nps_unidade_mes',
               'vw_distribuicao_pergunta','vw_comentarios'];

async function consultar(nome, key) {
  const r = await fetch(`${URL}/rest/v1/${nome}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  let corpo = null;
  try { corpo = await r.json(); } catch { /* ignora */ }
  return { status: r.status, linhas: Array.isArray(corpo) ? corpo.length : null, corpo };
}

console.log('\n==============================================');
console.log(' VERIFICAÇÃO DO SUPABASE —', URL);
console.log('==============================================\n');

// 1) Conexão + exposição das tabelas/views (como ANON → RLS filtra tudo)
console.log('[1] Conexão e RLS (chave anon — deve retornar 0 linhas):');
let falhas = 0;
for (const nome of [...TABELAS, ...VIEWS]) {
  const { status, linhas } = await consultar(nome, ANON);
  if (status === 200 && linhas === 0) {
    console.log(`    ok    ${nome.padEnd(26)} 200 · 0 linhas (RLS ativa)`);
  } else if (status === 200 && linhas > 0) {
    console.log(`    ALERTA ${nome.padEnd(26)} 200 · ${linhas} linha(s) VISÍVEL p/ anon — checar RLS!`);
    falhas++;
  } else if (status === 404) {
    console.log(`    FALHA ${nome.padEnd(26)} 404 · não existe / não exposto`);
    falhas++;
  } else {
    console.log(`    FALHA ${nome.padEnd(26)} ${status}`);
    falhas++;
  }
}

// 2) Verificação profunda (opcional, só com service_role): lê o seed de verdade
if (SERVICE) {
  console.log('\n[2] Dados do seed (chave service_role — ignora RLS):');
  const inst = await consultar('instituto', SERVICE);
  const nome = inst.corpo?.[0]?.nome;
  console.log(`    institutos: ${inst.linhas} ${nome ? '('+nome+')' : ''}`);
  const nps = await fetch(`${URL}/rest/v1/vw_nps_unidade_mes?select=unidade_nome,nps,total`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then(r => r.json());
  if (Array.isArray(nps) && nps.length) {
    for (const r of nps) console.log(`    NPS ${r.unidade_nome}: ${r.nps} (${r.total} resp.)`);
  } else {
    console.log('    (view de NPS vazia — rode o 04_seed_exemplo.sql)');
  }
} else {
  console.log('\n[2] (pulei a verificação profunda — SUPABASE_SERVICE_ROLE não informado)');
}

console.log('\n----------------------------------------------');
if (falhas === 0) {
  console.log(' RESULTADO: tudo certo. Schema exposto e RLS protegendo os dados.');
} else {
  console.log(` RESULTADO: ${falhas} item(ns) com problema — ver acima.`);
  process.exitCode = 1;
}
console.log('----------------------------------------------\n');
