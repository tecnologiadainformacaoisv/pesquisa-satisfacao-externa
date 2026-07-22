import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { carregarVisaoGeral, resumoPorInstituto, totaisGerais, criarInstituto, slugify } from './lib/operador';

/* Visão do dono do SaaS (papel='admin', cross-instituto) — não é a visão de
   nenhum instituto específico, é "quantas empresas estamos atendendo e como
   cada uma está indo". Ver app/src/lib/operador.js pro porquê disso ser
   possível sem tocar em RLS nenhuma. */
export default function PainelOperador() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  function carregar() {
    setCarregando(true); setErro('');
    return carregarVisaoGeral()
      .then(setDados)
      .catch((e) => setErro(e.message || String(e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => { carregar(); }, []);

  const totais = dados ? totaisGerais(dados) : null;
  const porInstituto = dados ? resumoPorInstituto(dados) : [];

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <div className="mark">ISV</div>
          <div className="mtxt">
            <span className="mn">Visão geral do SaaS</span>
            <span className="ms">Todos os institutos</span>
          </div>
        </div>
        <div className="topo-dir">
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      {carregando && <Centro><div className="spinner" /><p>Carregando…</p></Centro>}
      {erro && <div className="alerta">{erro}</div>}

      {totais && !carregando && (
        <main className="grade">
          <section className="kpis">
            <Kpi rotulo="Institutos" valor={totais.institutos} nota="clientes ativos" />
            <Kpi rotulo="Municípios" valor={totais.municipios} nota="agrupadores/contratos" />
            <Kpi rotulo="Unidades" valor={totais.unidades} nota="pontos de coleta" />
            <Kpi rotulo="Respostas" valor={totais.respostas} nota="em todos os institutos" />
          </section>

          <Card titulo="Novo instituto" sub="Cadastra um cliente novo no SaaS" larga>
            <FormNovoInstituto onCriado={carregar} />
          </Card>

          <Card titulo="Por instituto" sub="NPS e índice de satisfação de cada cliente" larga>
            {porInstituto.length === 0 ? <p className="sub">Nenhum instituto cadastrado.</p> : (
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Instituto</th>
                      <th>Municípios</th>
                      <th>Unidades</th>
                      <th>Respostas</th>
                      <th>NPS</th>
                      <th>Índice de satisfação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porInstituto.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <span className="chip" style={{ background: i.cor }} />
                          {i.nome}
                        </td>
                        <td>{i.municipios}</td>
                        <td>{i.unidades}</td>
                        <td>{i.respostas}</td>
                        <td style={{ color: corNps(i.nps) }}>{i.nps ?? '—'}</td>
                        <td>{i.indice != null ? `${i.indice}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </main>
      )}
    </div>
  );
}

function FormNovoInstituto({ onCriado }) {
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [cor, setCor] = useState('#0B6E63');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  function mudarNome(v) {
    setNome(v);
    if (!slugTocado) setSlug(slugify(v));
  }

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setErro(''); setOk('');
    try {
      const criado = await criarInstituto({ nome: nome.trim(), slug: slug.trim(), cor });
      setOk(`"${criado.nome}" criado — já aparece na tabela abaixo.`);
      setNome(''); setSlug(''); setSlugTocado(false); setCor('#0B6E63');
      await onCriado();
    } catch (err) {
      setErro(err.message || String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="form-instituto" onSubmit={enviar}>
      <div className="form-linha">
        <label>
          Nome
          <input value={nome} onChange={(e) => mudarNome(e.target.value)} required
                 placeholder="Ex.: Rede Bem Estar" />
        </label>
        <label>
          Identificador (slug)
          <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTocado(true); }} required
                 placeholder="rede-bem-estar" />
        </label>
        <label className="form-cor">
          Cor
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        </label>
        <button className="btn" disabled={enviando}>{enviando ? 'Criando…' : 'Criar instituto'}</button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="sub" style={{ color: 'var(--good)' }}>{ok}</p>}
      <p className="sub">
        Depois de criado, cadastre município/unidades/questionário via script
        (ainda não tem tela pra isso — próximo passo).
      </p>
    </form>
  );
}

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

function Kpi({ rotulo, valor, nota }) {
  return (
    <div className="kpi">
      <span className="kpi-r">{rotulo}</span>
      <span className="kpi-v">{valor}</span>
      <span className="kpi-n">{nota}</span>
    </div>
  );
}

const corNps = (n) => (n == null ? 'var(--muted)' : n < 0 ? '#A63A30' : n < 50 ? '#DE8038' : '#0C6036');
