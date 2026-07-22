import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  carregarVisaoGeral, resumoPorInstituto, totaisGerais, criarInstituto, slugify,
  carregarDetalhesInstituto, criarMunicipio, criarUnidade, criarModeloPesquisa, criarPergunta,
} from './lib/operador';

const TIPOS_PERGUNTA = [
  { v: 'nps', label: 'NPS (nota 0–10)' },
  { v: 'estrela', label: 'Estrelas (1–5)' },
  { v: 'carinha', label: 'Carinhas (1–5)' },
  { v: 'texto', label: 'Comentário livre' },
];

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

      {/* só mostra o spinner de tela cheia na 1ª carga (dados ainda null) — nas
          atualizações em segundo plano (depois de criar algo lá embaixo), o
          <main> continua montado, senão o formulário/seleção de instituto
          perderia o estado a cada cadastro (município, unidade, pergunta). */}
      {carregando && !dados && <Centro><div className="spinner" /><p>Carregando…</p></Centro>}
      {erro && <div className="alerta">{erro}</div>}

      {totais && (
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

          <Card titulo="Gerenciar instituto" sub="Município, unidades e questionário de um cliente" larga>
            <GerenciarInstituto institutos={dados.institutos} onMudou={carregar} />
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
      <p className="sub">Depois de criado, cadastre município/unidades/questionário logo abaixo, em "Gerenciar instituto".</p>
    </form>
  );
}

function GerenciarInstituto({ institutos, onMudou }) {
  const [institutoId, setInstitutoId] = useState('');
  const [detalhes, setDetalhes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  function recarregar(id) {
    setCarregando(true); setErro('');
    return carregarDetalhesInstituto(id)
      .then(setDetalhes)
      .catch((e) => setErro(e.message || String(e)))
      .finally(() => setCarregando(false));
  }

  function selecionar(id) {
    setInstitutoId(id);
    setDetalhes(null);
    if (id) recarregar(id);
  }

  async function atualizarTudo() {
    await recarregar(institutoId);
    await onMudou();
  }

  return (
    <div className="gerenciar">
      <label className="gerenciar-select">
        Instituto
        <select value={institutoId} onChange={(e) => selecionar(e.target.value)}>
          <option value="">Selecione um instituto…</option>
          {institutos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
      </label>

      {carregando && <p className="sub">Carregando…</p>}
      {erro && <p className="erro">{erro}</p>}

      {detalhes && !carregando && (
        <div className="gerenciar-blocos">
          <BlocoMunicipios institutoId={institutoId} municipios={detalhes.municipios} onMudou={atualizarTudo} />
          <BlocoUnidades institutoId={institutoId} municipios={detalhes.municipios} unidades={detalhes.unidades} onMudou={atualizarTudo} />
          <BlocoQuestionario institutoId={institutoId} modelos={detalhes.modelos} perguntas={detalhes.perguntas} onMudou={atualizarTudo} />
        </div>
      )}
    </div>
  );
}

function BlocoMunicipios({ institutoId, municipios, onMudou }) {
  const [nome, setNome] = useState('');
  const [uf, setUf] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try {
      await criarMunicipio({ instituto_id: institutoId, nome: nome.trim(), uf: uf.trim().toUpperCase() });
      setNome(''); setUf('');
      await onMudou();
    } catch (err) { setErro(err.message || String(err)); }
    finally { setEnviando(false); }
  }

  return (
    <div className="gerenciar-bloco">
      <h3>Municípios</h3>
      {municipios.length === 0 ? <p className="sub">Nenhum ainda.</p> : (
        <ul className="lista-simples">
          {municipios.map((m) => <li key={m.id}>{m.nome}{m.uf ? ` (${m.uf})` : ''}</li>)}
        </ul>
      )}
      <form className="form-linha form-linha-compacta" onSubmit={enviar}>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Caucaia" />
        </label>
        <label className="form-uf">
          UF
          <input value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} placeholder="CE" />
        </label>
        <button className="btn ghost" disabled={enviando}>{enviando ? 'Adicionando…' : 'Adicionar'}</button>
      </form>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

function BlocoUnidades({ institutoId, municipios, unidades, onMudou }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try {
      await criarUnidade({ instituto_id: institutoId, municipio_id: municipioId, nome: nome.trim(), tipo: tipo.trim() });
      setNome(''); setTipo('');
      await onMudou();
    } catch (err) { setErro(err.message || String(err)); }
    finally { setEnviando(false); }
  }

  if (municipios.length === 0) {
    return (
      <div className="gerenciar-bloco">
        <h3>Unidades</h3>
        <p className="sub">Cadastre um município primeiro.</p>
      </div>
    );
  }

  return (
    <div className="gerenciar-bloco">
      <h3>Unidades</h3>
      {unidades.length === 0 ? <p className="sub">Nenhuma ainda.</p> : (
        <ul className="lista-simples">
          {unidades.map((u) => <li key={u.id}>{u.nome}{u.tipo ? ` — ${u.tipo}` : ''}</li>)}
        </ul>
      )}
      <form className="form-linha form-linha-compacta" onSubmit={enviar}>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: UBS Centro" />
        </label>
        <label>
          Tipo
          <input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="UBS, loja, escola…" />
        </label>
        <label>
          Município
          <select value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} required>
            <option value="">Selecione…</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <button className="btn ghost" disabled={enviando}>{enviando ? 'Adicionando…' : 'Adicionar'}</button>
      </form>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

function BlocoQuestionario({ institutoId, modelos, perguntas, onMudou }) {
  const [criandoModelo, setCriandoModelo] = useState(false);
  const [erro, setErro] = useState('');

  async function criarQuestionario() {
    setCriandoModelo(true); setErro('');
    try {
      await criarModeloPesquisa({ instituto_id: institutoId, nome: 'Satisfação do Paciente' });
      await onMudou();
    } catch (err) { setErro(err.message || String(err)); }
    finally { setCriandoModelo(false); }
  }

  const modelo = modelos[0]; // um instituto começa com 1 questionário ativo

  if (!modelo) {
    return (
      <div className="gerenciar-bloco">
        <h3>Questionário</h3>
        <p className="sub">Esse instituto ainda não tem questionário.</p>
        <button className="btn ghost" onClick={criarQuestionario} disabled={criandoModelo}>
          {criandoModelo ? 'Criando…' : 'Criar questionário'}
        </button>
        {erro && <p className="erro">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="gerenciar-bloco">
      <h3>Questionário — {modelo.nome}</h3>
      {perguntas.length === 0 ? <p className="sub">Nenhuma pergunta ainda.</p> : (
        <ol className="lista-simples">
          {perguntas.map((p) => (
            <li key={p.id}>{p.texto} <span className="sub">({TIPOS_PERGUNTA.find((t) => t.v === p.tipo)?.label})</span></li>
          ))}
        </ol>
      )}
      <FormNovaPergunta institutoId={institutoId} modeloId={modelo.id} proximaOrdem={perguntas.length + 1} onMudou={onMudou} />
    </div>
  );
}

function FormNovaPergunta({ institutoId, modeloId, proximaOrdem, onMudou }) {
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState('estrela');
  const [obrigatoria, setObrigatoria] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try {
      await criarPergunta({
        instituto_id: institutoId, modelo_id: modeloId, ordem: proximaOrdem,
        tipo, texto: texto.trim(), obrigatoria: tipo === 'texto' ? false : obrigatoria,
      });
      setTexto('');
      await onMudou();
    } catch (err) { setErro(err.message || String(err)); }
    finally { setEnviando(false); }
  }

  return (
    <form className="form-linha form-linha-compacta" onSubmit={enviar}>
      <label>
        Pergunta
        <input value={texto} onChange={(e) => setTexto(e.target.value)} required placeholder="Ex.: Atendimento" />
      </label>
      <label>
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_PERGUNTA.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </label>
      {tipo !== 'texto' && (
        <label className="form-checkbox">
          <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
          Obrigatória
        </label>
      )}
      <button className="btn ghost" disabled={enviando}>{enviando ? 'Adicionando…' : 'Adicionar pergunta'}</button>
      {erro && <p className="erro">{erro}</p>}
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
