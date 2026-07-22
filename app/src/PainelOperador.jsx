import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  carregarVisaoGeral, resumoPorInstituto, totaisGerais, criarInstituto, slugify, atualizarInstituto,
  carregarDetalhesInstituto, criarMunicipio, atualizarMunicipio, excluirMunicipio,
  criarUnidade, atualizarUnidade, excluirUnidade,
  criarModeloPesquisa, criarPergunta, atualizarPergunta, excluirPergunta,
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

  const instituto = institutos.find((i) => i.id === institutoId);

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

      {instituto && detalhes && !carregando && (
        <>
          <EditorInstituto instituto={instituto} onMudou={onMudou} />
          <div className="gerenciar-blocos">
            <BlocoMunicipios institutoId={institutoId} municipios={detalhes.municipios} onMudou={atualizarTudo} />
            <BlocoUnidades institutoId={institutoId} municipios={detalhes.municipios} unidades={detalhes.unidades} onMudou={atualizarTudo} />
            <BlocoQuestionario institutoId={institutoId} modelos={detalhes.modelos} perguntas={detalhes.perguntas} onMudou={atualizarTudo} />
          </div>
        </>
      )}
    </div>
  );
}

function EditorInstituto({ instituto, onMudou }) {
  const [nome, setNome] = useState(instituto.nome);
  const [cor, setCor] = useState(instituto.cor_acento || '#0B6E63');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  // troca de instituto selecionado no dropdown -> recomeça os campos
  useEffect(() => { setNome(instituto.nome); setCor(instituto.cor_acento || '#0B6E63'); setOk(false); }, [instituto.id]);

  async function salvar(e) {
    e.preventDefault();
    setEnviando(true); setErro(''); setOk(false);
    try {
      await atualizarInstituto(instituto.id, { nome: nome.trim(), cor });
      setOk(true);
      await onMudou();
    } catch (err) { setErro(err.message || String(err)); }
    finally { setEnviando(false); }
  }

  return (
    <form className="form-linha form-linha-compacta" onSubmit={salvar}>
      <label>
        Nome do instituto
        <input value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label className="form-cor">
        Cor
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
      </label>
      <button className="btn ghost" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar instituto'}</button>
      {ok && <span className="sub" style={{ color: 'var(--good)' }}>Salvo.</span>}
      {erro && <p className="erro">{erro}</p>}
    </form>
  );
}

function BlocoMunicipios({ institutoId, municipios, onMudou }) {
  const [nome, setNome] = useState('');
  const [uf, setUf] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [editandoId, setEditandoId] = useState(null);

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

  async function excluir(m) {
    if (!window.confirm(`Excluir "${m.nome}"? Isso apaga junto todas as unidades desse município.`)) return;
    try { await excluirMunicipio(m.id); await onMudou(); }
    catch (err) { setErro(err.message || String(err)); }
  }

  return (
    <div className="gerenciar-bloco">
      <h3>Municípios</h3>
      {municipios.length === 0 ? <p className="sub">Nenhum ainda.</p> : (
        <ul className="lista-simples">
          {municipios.map((m) => editandoId === m.id ? (
            <li key={m.id}>
              <ItemEditorMunicipio municipio={m} onSalvo={() => { setEditandoId(null); onMudou(); }} onCancelar={() => setEditandoId(null)} />
            </li>
          ) : (
            <li key={m.id}>
              <span>{m.nome}{m.uf ? ` (${m.uf})` : ''}</span>
              <span className="acoes-item">
                <button type="button" className="link" onClick={() => setEditandoId(m.id)}>editar</button>
                <button type="button" className="link link-perigo" onClick={() => excluir(m)}>excluir</button>
              </span>
            </li>
          ))}
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

function ItemEditorMunicipio({ municipio, onSalvo, onCancelar }) {
  const [nome, setNome] = useState(municipio.nome);
  const [uf, setUf] = useState(municipio.uf || '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try { await atualizarMunicipio(municipio.id, { nome: nome.trim(), uf: uf.trim().toUpperCase() }); onSalvo(); }
    catch (err) { setErro(err.message || String(err)); setEnviando(false); }
  }

  return (
    <form className="form-linha form-linha-compacta form-linha-edicao" onSubmit={salvar}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} required />
      <input className="form-uf" value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} />
      <button className="btn ghost" disabled={enviando}>Salvar</button>
      <button type="button" className="link" onClick={onCancelar}>cancelar</button>
      {erro && <p className="erro">{erro}</p>}
    </form>
  );
}

function BlocoUnidades({ institutoId, municipios, unidades, onMudou }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [editandoId, setEditandoId] = useState(null);

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

  async function excluir(u) {
    if (!window.confirm(`Excluir "${u.nome}"? Respostas já registradas nessa unidade não são apagadas.`)) return;
    try { await excluirUnidade(u.id); await onMudou(); }
    catch (err) { setErro(err.message || String(err)); }
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
          {unidades.map((u) => editandoId === u.id ? (
            <li key={u.id}>
              <ItemEditorUnidade unidade={u} municipios={municipios}
                onSalvo={() => { setEditandoId(null); onMudou(); }} onCancelar={() => setEditandoId(null)} />
            </li>
          ) : (
            <li key={u.id}>
              <span>{u.nome}{u.tipo ? ` — ${u.tipo}` : ''}</span>
              <span className="acoes-item">
                <button type="button" className="link" onClick={() => setEditandoId(u.id)}>editar</button>
                <button type="button" className="link link-perigo" onClick={() => excluir(u)}>excluir</button>
              </span>
            </li>
          ))}
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

function ItemEditorUnidade({ unidade, municipios, onSalvo, onCancelar }) {
  const [nome, setNome] = useState(unidade.nome);
  const [tipo, setTipo] = useState(unidade.tipo || '');
  const [municipioId, setMunicipioId] = useState(unidade.municipio_id);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try { await atualizarUnidade(unidade.id, { nome: nome.trim(), tipo: tipo.trim(), municipio_id: municipioId }); onSalvo(); }
    catch (err) { setErro(err.message || String(err)); setEnviando(false); }
  }

  return (
    <form className="form-linha form-linha-compacta form-linha-edicao" onSubmit={salvar}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} required />
      <input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Tipo" />
      <select value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} required>
        {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </select>
      <button className="btn ghost" disabled={enviando}>Salvar</button>
      <button type="button" className="link" onClick={onCancelar}>cancelar</button>
      {erro && <p className="erro">{erro}</p>}
    </form>
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

  const [editandoId, setEditandoId] = useState(null);
  const modelo = modelos[0]; // um instituto começa com 1 questionário ativo

  async function excluir(p) {
    if (!window.confirm(`Excluir a pergunta "${p.texto}"? Respostas já dadas mantêm a nota, só perdem o vínculo com o texto da pergunta.`)) return;
    try { await excluirPergunta(p.id); await onMudou(); }
    catch (err) { setErro(err.message || String(err)); }
  }

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
          {perguntas.map((p) => editandoId === p.id ? (
            <li key={p.id}>
              <ItemEditorPergunta pergunta={p} onSalvo={() => { setEditandoId(null); onMudou(); }} onCancelar={() => setEditandoId(null)} />
            </li>
          ) : (
            <li key={p.id}>
              <span>{p.texto} <span className="sub">({TIPOS_PERGUNTA.find((t) => t.v === p.tipo)?.label})</span></span>
              <span className="acoes-item">
                <button type="button" className="link" onClick={() => setEditandoId(p.id)}>editar</button>
                <button type="button" className="link link-perigo" onClick={() => excluir(p)}>excluir</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <FormNovaPergunta institutoId={institutoId} modeloId={modelo.id} proximaOrdem={perguntas.length + 1} onMudou={onMudou} />
    </div>
  );
}

function ItemEditorPergunta({ pergunta, onSalvo, onCancelar }) {
  const [texto, setTexto] = useState(pergunta.texto);
  const [tipo, setTipo] = useState(pergunta.tipo);
  const [obrigatoria, setObrigatoria] = useState(pergunta.obrigatoria);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try {
      await atualizarPergunta(pergunta.id, { texto: texto.trim(), tipo, obrigatoria: tipo === 'texto' ? false : obrigatoria });
      onSalvo();
    } catch (err) { setErro(err.message || String(err)); setEnviando(false); }
  }

  return (
    <form className="form-linha form-linha-compacta form-linha-edicao" onSubmit={salvar}>
      <input value={texto} onChange={(e) => setTexto(e.target.value)} required />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
        {TIPOS_PERGUNTA.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
      </select>
      {tipo !== 'texto' && (
        <label className="form-checkbox">
          <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
          Obrigatória
        </label>
      )}
      <button className="btn ghost" disabled={enviando}>Salvar</button>
      <button type="button" className="link" onClick={onCancelar}>cancelar</button>
      {erro && <p className="erro">{erro}</p>}
    </form>
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
