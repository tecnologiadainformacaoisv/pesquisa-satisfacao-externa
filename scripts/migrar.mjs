/* Migração: Google Sheets (aba "Respostas") → Supabase (resposta / resposta_item).
   Cria municípios e unidades que ainda não existirem, sob o instituto ISV.

   Fonte dos dados (uma das duas, no .env):
     MIGRACAO_CSV=caminho/para/Respostas.csv        (Arquivo → Download → CSV)
     MIGRACAO_APPS_SCRIPT_URL=https://script.google.com/.../exec   (endpoint ?action=dados)

   Requer no .env: SUPABASE_URL e SUPABASE_SERVICE_ROLE (chave secreta; ignora RLS).

   Uso:
     node produto-isv/scripts/migrar.mjs            (carrega; recusa se já houver dados)
     node produto-isv/scripts/migrar.mjs --limpar   (apaga respostas do ISV e recarrega)
     node produto-isv/scripts/migrar.mjs --dry       (só analisa, não grava)
*/

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const raiz = join(__dir, '..');
const args = new Set(process.argv.slice(2));
const LIMPAR = args.has('--limpar');
const DRY = args.has('--dry');

// ---------- .env ----------
const env = {};
try {
  for (const line of readFileSync(join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { fail('.env não encontrado em produto-isv/.env'); }

const URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE || '';
if (!URL) fail('SUPABASE_URL vazio no .env');
if (!KEY) fail('SUPABASE_SERVICE_ROLE vazio no .env (chave secreta — Project Settings → API).');

function fail(msg) { console.error('ERRO:', msg); process.exit(1); }
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// ---------- Supabase (PostgREST) ----------
async function sb(method, path, body, prefer) {
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) fail(`${method} ${path} → HTTP ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

// ---------- Parser de CSV (aspas, vírgulas e quebras dentro de campo) ----------
function parseCSV(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c === '\r') { /* ignora */ }
    else campo += c;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(x => x !== ''));
}

// ---------- Carregar as linhas da fonte ----------
async function carregarLinhas() {
  if (env.MIGRACAO_CSV) {
    const p = isAbsolute(env.MIGRACAO_CSV) ? env.MIGRACAO_CSV : resolve(raiz, env.MIGRACAO_CSV);
    console.log('Fonte: CSV', p);
    const linhas = parseCSV(readFileSync(p, 'utf8'));
    const cab = linhas[0].map(norm);
    return linhas.slice(1).map(cols => Object.fromEntries(cab.map((h, i) => [h, cols[i] ?? ''])));
  }
  if (env.MIGRACAO_APPS_SCRIPT_URL) {
    console.log('Fonte: Apps Script', env.MIGRACAO_APPS_SCRIPT_URL);
    const arr = await fetch(env.MIGRACAO_APPS_SCRIPT_URL).then(r => r.json());
    return arr.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [norm(k), v])));
  }
  fail('Defina MIGRACAO_CSV ou MIGRACAO_APPS_SCRIPT_URL no .env');
}

// ---------- Execução ----------
console.log('\n==============================================');
console.log(' MIGRAÇÃO Sheets → Supabase', DRY ? '(DRY-RUN)' : '');
console.log('==============================================\n');

// instituto ISV, modelo e perguntas
const [inst] = await sb('GET', 'instituto?slug=eq.isv&select=id,nome');
if (!inst) fail('Instituto ISV não encontrado (rode 04_seed_exemplo.sql).');
const institutoId = inst.id;
const [modelo] = await sb('GET', `modelo_pesquisa?instituto_id=eq.${institutoId}&select=id&order=criado_em.asc&limit=1`);
if (!modelo) fail('Nenhum modelo_pesquisa para o ISV.');
const perguntas = await sb('GET', `pergunta?modelo_id=eq.${modelo.id}&select=id,tipo,texto`);

// mapa: coluna da planilha → { pergunta_id, tipo }
function achaPergunta(pred) { return perguntas.find(pred); }
const P = {
  nps:         achaPergunta(p => p.tipo === 'nps'),
  recepcao:    achaPergunta(p => p.tipo === 'estrela' && norm(p.texto).includes('recep')),
  limpeza:     achaPergunta(p => p.tipo === 'estrela' && norm(p.texto).includes('limpez')),
  atendimento: achaPergunta(p => p.tipo === 'estrela' && norm(p.texto).includes('atend')),
  espera:      achaPergunta(p => p.tipo === 'estrela' && norm(p.texto).includes('esper')),
  comentario:  achaPergunta(p => p.tipo === 'texto'),
};

const linhas = await carregarLinhas();
console.log(`Linhas na fonte: ${linhas.length}\n`);
if (!linhas.length) fail('Planilha vazia.');

// pré-carrega municípios/unidades existentes
const mCache = new Map(); // nome_norm → id
for (const m of await sb('GET', `municipio?instituto_id=eq.${institutoId}&select=id,nome`)) mCache.set(norm(m.nome), m.id);
const uCache = new Map(); // municipioId|nome_norm → id
for (const u of await sb('GET', `unidade?instituto_id=eq.${institutoId}&select=id,nome,municipio_id`)) uCache.set(u.municipio_id + '|' + norm(u.nome), u.id);

async function garanteMunicipio(nome) {
  const k = norm(nome) || 'sem-municipio';
  if (mCache.has(k)) return mCache.get(k);
  if (DRY) { mCache.set(k, 'dry-' + k); return mCache.get(k); }
  const [novo] = await sb('POST', 'municipio', [{ instituto_id: institutoId, nome: nome || 'Sem município' }], 'return=representation');
  mCache.set(k, novo.id); return novo.id;
}
async function garanteUnidade(municipioId, nome) {
  const k = municipioId + '|' + (norm(nome) || 'sem-unidade');
  if (uCache.has(k)) return uCache.get(k);
  if (DRY) { uCache.set(k, 'dry-' + k); return uCache.get(k); }
  const [novo] = await sb('POST', 'unidade',
    [{ instituto_id: institutoId, municipio_id: municipioId, nome: nome || 'Sem unidade' }], 'return=representation');
  uCache.set(k, novo.id); return novo.id;
}

// segurança contra duplicar
const [{ count } = {}] = [await sb('GET', `resposta?instituto_id=eq.${institutoId}&select=id`)].map(a => ({ count: a.length }));
if (count > 0 && !LIMPAR && !DRY) {
  fail(`Já existem ${count} resposta(s) para o ISV. Rode com --limpar para apagar e recarregar, ou --dry para só analisar.`);
}
if (LIMPAR && !DRY) {
  console.log(`Limpando ${count} resposta(s) existente(s) do ISV...`);
  await sb('DELETE', `resposta?instituto_id=eq.${institutoId}`, null, 'return=minimal');
}

// monta respostas + itens
const respostas = [], itens = [];
let semUnidade = 0, semData = 0;
function toDate(v) {
  if (!v) { semData++; return new Date().toISOString(); }
  const d = new Date(v);
  if (isNaN(d)) { semData++; return new Date().toISOString(); }
  return d.toISOString();
}
function addItem(rid, p, valorNum, valorTexto) {
  if (!p) return;
  if (valorTexto != null) { const t = String(valorTexto).trim(); if (!t) return;
    itens.push({ instituto_id: institutoId, resposta_id: rid, pergunta_id: p.id, tipo: p.tipo, valor_texto: t }); return; }
  const n = parseInt(valorNum, 10);
  if (Number.isNaN(n)) return;
  itens.push({ instituto_id: institutoId, resposta_id: rid, pergunta_id: p.id, tipo: p.tipo, valor_num: n });
}

for (const row of linhas) {
  const municipio = row['municipio'] ?? '';
  const unidadeNome = row['unidade'] ?? '';
  const mId = await garanteMunicipio(municipio);
  const uId = await garanteUnidade(mId, unidadeNome);
  if (!unidadeNome) semUnidade++;

  const rid = randomUUID();
  respostas.push({ id: rid, instituto_id: institutoId, unidade_id: uId, modelo_id: modelo.id,
                   origem: 'totem', criado_em: toDate(row['timestamp']) });
  addItem(rid, P.nps,         row['nps']);
  addItem(rid, P.recepcao,    row['recepcao']);
  addItem(rid, P.limpeza,     row['limpeza']);
  addItem(rid, P.atendimento, row['atendimento']);
  addItem(rid, P.espera,      row['espera']);
  addItem(rid, P.comentario,  null, row['comentario']);
}

console.log('Resumo do que será gravado:');
console.log('  respostas       :', respostas.length);
console.log('  itens (respostas):', itens.length);
console.log('  municípios (total):', mCache.size);
console.log('  unidades (total)  :', uCache.size);
if (semUnidade) console.log('  aviso: linhas sem unidade:', semUnidade);
if (semData)    console.log('  aviso: datas ausentes/inválidas (usou agora):', semData);

if (DRY) { console.log('\nDRY-RUN — nada foi gravado.\n'); process.exit(0); }

console.log('\nGravando...');
for (const c of chunk(respostas, 500)) await sb('POST', 'resposta', c, 'return=minimal');
for (const c of chunk(itens, 500))     await sb('POST', 'resposta_item', c, 'return=minimal');

console.log('\n----------------------------------------------');
console.log(` OK: ${respostas.length} respostas e ${itens.length} itens migrados para o ISV.`);
console.log('----------------------------------------------\n');
