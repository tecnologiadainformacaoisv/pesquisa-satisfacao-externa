/* Prova que as correções do 07_rls_correcoes.sql realmente fecharam as brechas.
   Cria um instituto "vizinho" temporário, tenta os ataques como o totem, e limpa tudo.
   Uso: node produto-isv/scripts/testar-seguranca.mjs */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const raiz = join(__dir, '..');
const ler = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
  .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));

const base = ler(join(raiz, '.env'));
const app = ler(join(raiz, 'app', '.env'));
const URL = base.SUPABASE_URL.replace(/\/+$/, '');
const SRV = { apikey: base.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${base.SUPABASE_SERVICE_ROLE}`, 'Content-Type': 'application/json' };

let ok = 0, fail = 0;
const passou = (t) => { console.log(`   PASSOU  ${t}`); ok++; };
const falhou = (t, d) => { console.log(`   FALHOU  ${t}${d ? '  → ' + d : ''}`); fail++; };

const srvGet = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: SRV }).then((r) => r.json());
const srvPost = (p, b) => fetch(`${URL}/rest/v1/${p}`, { method: 'POST', headers: { ...SRV, Prefer: 'return=representation' }, body: JSON.stringify(b) }).then((r) => r.json());
const srvDel = (p) => fetch(`${URL}/rest/v1/${p}`, { method: 'DELETE', headers: SRV });

console.log('\n==============================================');
console.log(' TESTE DE SEGURANÇA — pós 07_rls_correcoes.sql');
console.log('==============================================\n');

// ---- login do totem (como o app faz) ----
const tk = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: app.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: app.VITE_TOTEM_EMAIL, password: app.VITE_TOTEM_PASSWORD }),
}).then((r) => r.json());
if (!tk.access_token) { console.error('login do totem falhou:', tk); process.exit(1); }
const TOT = { apikey: app.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${tk.access_token}`, 'Content-Type': 'application/json' };
const totPost = (p, b) => fetch(`${URL}/rest/v1/${p}`, { method: 'POST', headers: { ...TOT, Prefer: 'return=representation' }, body: JSON.stringify(b) });

// ---- contexto ----
const [isv] = await srvGet('instituto?slug=eq.isv&select=id');
const [perfil] = await srvGet(`usuario_perfil?papel=eq.totem&select=unidade_id,instituto_id`);
const [modelo] = await srvGet(`modelo_pesquisa?instituto_id=eq.${isv.id}&select=id&limit=1`);
const minhaUnidade = perfil.unidade_id;

// ---- monta um instituto vizinho temporário ----
const [vz] = await srvPost('instituto', [{ nome: 'ZZ Teste Vizinho', slug: 'zz-teste-vizinho' }]);
const [vzMun] = await srvPost('municipio', [{ instituto_id: vz.id, nome: 'Cidade Vizinha' }]);
const [vzUni] = await srvPost('unidade', [{ instituto_id: vz.id, municipio_id: vzMun.id, nome: 'Unidade Vizinha' }]);
// segunda unidade DO ISV (não é a do totem)
const [isvMun] = await srvGet(`municipio?instituto_id=eq.${isv.id}&select=id&limit=1`);
const [outraUni] = await srvPost('unidade', [{ instituto_id: isv.id, municipio_id: isvMun.id, nome: 'ZZ Outra Unidade ISV' }]);

console.log('[1] Totem NÃO deve LER respostas');
{
  const r = await fetch(`${URL}/rest/v1/resposta?select=id`, { headers: TOT }).then((x) => x.json());
  Array.isArray(r) && r.length === 0 ? passou('totem lê 0 respostas') : falhou('totem leu respostas', JSON.stringify(r).slice(0, 80));
}

console.log('[2] Totem NÃO deve gravar em unidade de OUTRO instituto');
{
  const r = await totPost('resposta', { instituto_id: isv.id, unidade_id: vzUni.id, modelo_id: modelo.id, origem: 'totem' });
  r.status >= 400 ? passou(`bloqueado (HTTP ${r.status})`) : falhou('conseguiu gravar cross-tenant!');
}

console.log('[3] Totem NÃO deve gravar em OUTRA unidade do próprio instituto');
{
  const r = await totPost('resposta', { instituto_id: isv.id, unidade_id: outraUni.id, modelo_id: modelo.id, origem: 'totem' });
  r.status >= 400 ? passou(`bloqueado (HTTP ${r.status})`) : falhou('gravou em unidade que não é a dele!');
}

// caminho real da coleta: RPC do 08 (id gerado no cliente, sem devolver linha)
const rpc = (b) => fetch(`${URL}/rest/v1/rpc/registrar_resposta`, { method: 'POST', headers: TOT, body: JSON.stringify(b) });

console.log('[4] Totem DEVE gravar na PRÓPRIA unidade (via RPC)');
const respTeste = crypto.randomUUID();
let gravou = false;
{
  const r = await rpc({ p_id: respTeste, p_unidade: minhaUnidade, p_modelo: modelo.id,
                        p_itens: [{ tipo: 'nps', valor_num: 9 }] });
  if (r.ok) { gravou = true; passou('gravou normalmente'); }
  else falhou(`não conseguiu gravar (HTTP ${r.status})`, await r.text());
}

console.log('[5] Reenvio da MESMA resposta não deve duplicar (idempotência)');
if (gravou) {
  await rpc({ p_id: respTeste, p_unidade: minhaUnidade, p_modelo: modelo.id,
              p_itens: [{ tipo: 'nps', valor_num: 9 }] });
  const itens = await srvGet(`resposta_item?resposta_id=eq.${respTeste}&select=id`);
  itens.length === 1 ? passou('continua com 1 item após reenvio')
                     : falhou(`duplicou: ${itens.length} itens`);
} else falhou('sem resposta base para testar');

console.log('[6] Nota fora da faixa deve ser rejeitada (nps = 99)');
{
  const r = await rpc({ p_id: crypto.randomUUID(), p_unidade: minhaUnidade, p_modelo: modelo.id,
                        p_itens: [{ tipo: 'nps', valor_num: 99 }] });
  const cod = r.ok ? null : (await r.json()).code;
  // Exige o motivo CERTO: check constraint (23514). Se passasse com
  // qualquer erro, este teste continuaria "verde" com a RPC quebrada.
  if (r.ok) falhou('aceitou nps=99!');
  else if (cod === '23514') passou('bloqueado pela constraint de faixa');
  else falhou(`bloqueado, mas pelo motivo errado (code ${cod})`);
}

console.log('[7] Transação: item inválido NÃO deve deixar resposta órfã');
if (gravou) {   // só faz sentido se a RPC comprovadamente grava
  const orfa = crypto.randomUUID();
  await rpc({ p_id: orfa, p_unidade: minhaUnidade, p_modelo: modelo.id,
              p_itens: [{ tipo: 'nps', valor_num: 9 }, { tipo: 'nps', valor_num: 99 }] });
  const r = await srvGet(`resposta?id=eq.${orfa}&select=id`);
  r.length === 0 ? passou('nada foi gravado (rollback)') : falhou('sobrou resposta sem itens!');
} else falhou('RPC não grava — rollback não é testável');

// ---- limpeza ----
await srvDel(`resposta?id=eq.${respTeste}`);
await srvDel(`unidade?id=eq.${outraUni.id}`);
await srvDel(`instituto?id=eq.${vz.id}`);   // cascata leva município e unidade

console.log('\n----------------------------------------------');
console.log(` ${ok} passaram · ${fail} falharam`);
console.log(fail === 0 ? ' TUDO CERTO — brechas fechadas.' : ' ATENÇÃO — ver falhas acima.');
console.log('----------------------------------------------\n');
process.exitCode = fail ? 1 : 0;
