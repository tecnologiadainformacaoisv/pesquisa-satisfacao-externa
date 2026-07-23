import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  carregarTudo, resumo, npsPorUnidade, satisfacaoPorMes, mediaPorPergunta,
  npsPorTurno, npsPorFaixaEtaria,
} from './lib/dados';
import { iniciais, estiloAcento } from './lib/marca';

const COR = { det: '#A63A30', neu: '#DE8038', prom: '#0C6036', acento: '#0B6E63' };
const mesRot = (iso) => {
  const [a, m] = iso.split('-');
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + a.slice(2);
};

/* Assume que quem chama já autenticou como admin (ver App.jsx) — este
   componente só carrega e mostra os relatórios do instituto. */
export default function PainelAdmin() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [unidadeId, setUnidadeId] = useState('');

  useEffect(() => {
    setCarregando(true); setErro('');
    carregarTudo()
      .then(setDados)
      .catch((e) => setErro(e.message || String(e)))
      .finally(() => setCarregando(false));
  }, []);

  const filtro = unidadeId || null;
  const r = dados ? resumo(dados, filtro) : null;

  return (
    <div className="app" style={estiloAcento(dados?.instituto?.cor_acento)}>
      <header className="topo">
        <div className="marca">
          {dados?.instituto?.logo_url
            ? <img className="mark mark-logo" src={dados.instituto.logo_url} alt="" />
            : <div className="mark">{iniciais(dados?.instituto?.nome)}</div>}
          <div className="mtxt">
            <span className="mn">{dados?.instituto?.nome || 'Instituto São Vicente'}</span>
            <span className="ms">Painel de satisfação</span>
          </div>
        </div>
        <div className="topo-dir">
          {dados && (
            <select className="filtro" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              <option value="">Todas as unidades</option>
              {dados.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          )}
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      {carregando && <Centro><div className="spinner" /><p>Carregando dados…</p></Centro>}
      {erro && <div className="alerta">{erro}</div>}

      {dados && !carregando && (
        r.respostas === 0 ? (
          <Centro>
            <h2>Ainda não há respostas</h2>
            <p className="sub">Assim que o totem registrar pesquisas, os indicadores aparecem aqui.</p>
          </Centro>
        ) : (
          <main className="grade">
            {/* KPIs */}
            <section className="kpis">
              <Kpi rotulo="NPS geral" valor={r.npsGeral} sufixo="" cor={corNps(r.npsGeral)}
                   nota={faixaNps(r.npsGeral)} />
              <Kpi rotulo="Índice de satisfação" valor={r.indice} sufixo="%" cor={COR.acento}
                   nota={`${r.itens} avaliações`} />
              <Kpi rotulo="Respostas" valor={r.respostas} sufixo="" cor="var(--ink)"
                   nota={filtro ? 'nesta unidade' : 'todas as unidades'} />
            </section>

            {/* Composição do NPS */}
            <Card titulo="Composição do NPS" sub="Como se distribuem as notas de 0 a 10">
              <Empilhado partes={[
                { rot: 'Detratores (0–6)', v: r.det, cor: COR.det },
                { rot: 'Neutros (7–8)', v: r.neu, cor: COR.neu },
                { rot: 'Promotores (9–10)', v: r.prom, cor: COR.prom },
              ]} total={r.respostas} />
            </Card>

            {/* NPS por unidade */}
            <Card titulo="NPS por unidade" sub="Do maior para o menor">
              <BarrasH itens={npsPorUnidade(dados.nps).map((u) => ({
                rot: u.unidade, valor: u.nps, texto: `${u.nps}`, sub: `${u.total} resp.`,
                min: -100, max: 100, cor: corNps(u.nps),
              }))} />
            </Card>

            {/* Satisfação por mês */}
            <Card titulo="Índice de satisfação por mês" sub="Percentual de avaliações boas ou melhores">
              <Colunas dados={satisfacaoPorMes(dados.satisfacao, filtro)} />
            </Card>

            {/* Média por pergunta */}
            <Card titulo="Média por pergunta" sub="Cada pergunta na sua própria escala">
              <BarrasH itens={mediaPorPergunta(dados.distribuicao).map((p) => ({
                rot: p.pergunta, valor: (p.media / p.max) * 100,
                texto: `${p.media.toFixed(1)}`, sub: `de ${p.max} · ${p.n} resp.`,
                min: 0, max: 100, cor: COR.acento,
              }))} />
            </Card>

            {/* NPS por turno */}
            <Card titulo="NPS por turno" sub="Respostas coletadas de dia ou à noite">
              <BarrasH itens={npsPorTurno(dados.npsTurno).map((t) => ({
                rot: t.rotulo, valor: t.nps, texto: `${t.nps}`, sub: `${t.total} resp.`,
                min: -100, max: 100, cor: corNps(t.nps),
              }))} />
            </Card>

            {/* NPS por faixa etária */}
            <Card titulo="NPS por faixa etária" sub="Só de quem informou a idade (pergunta opcional)">
              <BarrasH itens={npsPorFaixaEtaria(dados.npsFaixaEtaria).map((f) => ({
                rot: f.faixa, valor: f.nps, texto: `${f.nps}`, sub: `${f.total} resp.`,
                min: -100, max: 100, cor: corNps(f.nps),
              }))} />
            </Card>

            {/* Comentários */}
            <Card titulo="Comentários recentes" sub="O que as pessoas escreveram" larga>
              {(() => {
                const cs = (filtro ? dados.comentarios.filter((c) => c.unidade_id === filtro) : dados.comentarios);
                if (!cs.length) return <p className="sub">Nenhum comentário ainda.</p>;
                return (
                  <ul className="coments">
                    {cs.map((c, i) => (
                      <li key={i}>
                        <p className="ctxt">“{c.comentario}”</p>
                        <span className="cmeta">{c.unidade_nome} · {new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Card>
          </main>
        )
      )}
    </div>
  );
}

/* ---------------- componentes ---------------- */

function Centro({ children }) { return <div className="centro">{children}</div>; }

function Card({ titulo, sub, children, larga }) {
  return (
    <section className={'card' + (larga ? ' larga' : '')}>
      <header className="card-h">
        <h2>{titulo}</h2>
        {sub && <p className="sub">{sub}</p>}
      </header>
      {children}
    </section>
  );
}

function Kpi({ rotulo, valor, sufixo, cor, nota }) {
  return (
    <div className="kpi">
      <span className="kpi-r">{rotulo}</span>
      <span className="kpi-v" style={{ color: cor }}>
        {valor == null ? '—' : valor}{valor != null && sufixo}
      </span>
      <span className="kpi-n">{nota}</span>
    </div>
  );
}

/** Barra empilhada com legenda + rótulos diretos (nunca só cor). */
function Empilhado({ partes, total }) {
  if (!total) return <p className="sub">Sem dados.</p>;
  return (
    <div className="emp">
      <div className="emp-barra">
        {partes.map((p) => p.v > 0 && (
          <div key={p.rot} className="emp-seg" style={{ flex: p.v, background: p.cor }}
               title={`${p.rot}: ${p.v}`}>
            {(p.v / total) >= 0.09 && <span>{Math.round((p.v / total) * 100)}%</span>}
          </div>
        ))}
      </div>
      <ul className="legenda">
        {partes.map((p) => (
          <li key={p.rot}>
            <span className="chip" style={{ background: p.cor }} />
            {p.rot}<b>{p.v}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais com valor direto ao lado (dispensa tooltip). */
function BarrasH({ itens }) {
  if (!itens.length) return <p className="sub">Sem dados.</p>;
  return (
    <ul className="barras">
      {itens.map((it, i) => {
        const pct = ((it.valor - it.min) / (it.max - it.min)) * 100;
        return (
          <li key={i}>
            <div className="b-topo">
              <span className="b-rot">{it.rot}</span>
              <span className="b-val" style={{ color: it.cor }}>{it.texto}
                {it.sub && <em> {it.sub}</em>}</span>
            </div>
            <div className="b-trilha">
              <div className="b-fill" style={{ width: Math.max(1.5, pct) + '%', background: it.cor }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Colunas por mês, com rótulo no topo da última (série única: sem legenda). */
function Colunas({ dados }) {
  if (!dados.length) return <p className="sub">Sem dados.</p>;
  const max = Math.max(100, ...dados.map((d) => d.indice));
  return (
    <div className="colunas">
      {dados.map((d, i) => (
        <div className="col" key={d.mes}>
          <span className="col-v">{d.indice}%</span>
          <div className="col-trilha">
            <div className="col-fill"
                 style={{ height: Math.max(2, (d.indice / max) * 100) + '%',
                          background: i === dados.length - 1 ? COR.acento : '#7FB3AC' }} />
          </div>
          <span className="col-r">{mesRot(d.mes)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- auxiliares ---------------- */
const corNps = (n) => (n == null ? 'var(--muted)' : n < 0 ? COR.det : n < 50 ? COR.neu : COR.prom);
const faixaNps = (n) =>
  n == null ? 'sem dados' : n < 0 ? 'crítico' : n < 50 ? 'razoável' : n < 75 ? 'bom' : 'excelente';
