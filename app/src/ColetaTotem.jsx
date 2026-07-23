import { useEffect, useState } from 'react';
import {
  carregarConfig, enviar, enfileirar, tentarEnviarFila, pendentes, turnoAtual,
} from './lib/isv';

const NPS = Array.from({ length: 11 }, (_, i) => i);
const ESTRELAS = [1, 2, 3, 4, 5];
const CARINHAS = [
  { v: 1, cor: '#A63A30', rot: 'Ruim' },
  { v: 2, cor: '#DE8038', rot: 'Razoável' },
  { v: 3, cor: '#8DC570', rot: 'Bom' },
  { v: 4, cor: '#479A52', rot: 'Muito bom' },
  { v: 5, cor: '#0C6036', rot: 'Excelente' },
];
const FAIXAS_ETARIAS = ['0 a 14 anos', '15 a 22 anos', '23 a 35 anos', '36 a 55 anos', 'Acima de 56 anos'];

/* Assume que quem chama já cuidou de sessão + pareamento (ver App.jsx) —
   este componente só carrega o questionário do instituto/unidade já
   resolvidos e grava as respostas. */
export default function ColetaTotem() {
  const [fase, setFase] = useState('carregando'); // carregando|erro|demografia|form|enviando|obrigado
  const [erro, setErro] = useState('');
  const [cfg, setCfg] = useState(null);
  const [passo, setPasso] = useState(0);
  const [resp, setResp] = useState({});           // pergunta_id -> {valor_num|valor_texto}
  const [salvoOffline, setSalvoOffline] = useState(false);
  const [fila, setFila] = useState(0);
  const [faixaEtaria, setFaixaEtaria] = useState(null);

  async function iniciar() {
    try {
      const c = await carregarConfig();
      setCfg(c);
      setFase(c.modelo.coleta_demografia ? 'demografia' : 'form');
      tentarEnviarFila().then(() => setFila(pendentes())).catch(() => {});
    } catch (e) {
      setErro(e.message || String(e));
      setFase('erro');
    }
  }

  useEffect(() => {
    iniciar();
    const onNet = () => tentarEnviarFila().then(() => setFila(pendentes())).catch(() => {});
    window.addEventListener('online', onNet);
    return () => window.removeEventListener('online', onNet);
  }, []);

  const perguntas = cfg?.perguntas || [];
  const p = perguntas[passo];
  const val = p ? resp[p.id] : undefined;
  const definir = (v) => setResp((r) => ({ ...r, [p.id]: v }));

  const respondida =
    !p ? false
    : p.tipo === 'texto' ? true               // comentário é sempre "ok" (opcional)
    : val && val.valor_num != null;
  const podeAvancar = respondida || (p && !p.obrigatoria);

  const avancar = () => {
    if (passo < perguntas.length - 1) setPasso(passo + 1);
    else finalizar();
  };
  const voltar = () => passo > 0 && setPasso(passo - 1);

  async function finalizar() {
    setFase('enviando');
    const itens = perguntas.map((q) => {
      const v = resp[q.id];
      if (!v) return null;
      if (q.tipo === 'texto') {
        const t = (v.valor_texto || '').trim();
        return t ? { pergunta_id: q.id, tipo: q.tipo, valor_texto: t } : null;
      }
      return v.valor_num != null ? { pergunta_id: q.id, tipo: q.tipo, valor_num: v.valor_num } : null;
    }).filter(Boolean);

    const payload = {
      instituto_id: cfg.instituto.id,
      unidade_id: cfg.unidade.id,
      modelo_id: cfg.modelo.id,
      itens,
      faixa_etaria: faixaEtaria,
      turno: turnoAtual(),
    };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await enviar(payload);
      setSalvoOffline(false);
    } catch {
      enfileirar(payload);
      setSalvoOffline(true);
      setFila(pendentes());
    }
    setFase('obrigado');
    setTimeout(reiniciar, 4000);
  }

  const reiniciar = () => {
    setResp({}); setPasso(0); setSalvoOffline(false); setFaixaEtaria(null);
    setFase(cfg.modelo.coleta_demografia ? 'demografia' : 'form'); // próxima pessoa, pergunta de novo
  };

  // ---------- Telas de estado ----------
  if (fase === 'carregando') return <Centro><div className="spinner" /><p>Carregando…</p></Centro>;

  if (fase === 'erro') return (
    <Centro>
      <h2>Não foi possível iniciar</h2>
      <p className="erro">{erro}</p>
      <button className="btn" onClick={() => location.reload()}>Tentar de novo</button>
    </Centro>
  );

  if (fase === 'demografia') return (
    <div className="tela">
      <main className="conteudo">
        <div className="ask">
          <div className="ask-q">Qual a sua idade?</div>
          <div className="ask-s">Só pra melhorar nossos relatórios — se preferir, pode pular.</div>
        </div>
        <div className="faixas">
          {FAIXAS_ETARIAS.map((f) => (
            <button key={f} className="btn" onClick={() => { setFaixaEtaria(f); setFase('form'); }}>{f}</button>
          ))}
        </div>
      </main>
      <footer className="rodape">
        <span />
        <button className="btn ghost" onClick={() => setFase('form')}>Pular</button>
      </footer>
    </div>
  );

  if (fase === 'enviando') return <Centro><div className="spinner" /><p>Enviando…</p></Centro>;

  if (fase === 'obrigado') return (
    <Centro>
      <div className="check">✓</div>
      <h1 className="ask-q">Obrigado por participar!</h1>
      <p className="ask-s">
        {salvoOffline
          ? 'Sua resposta foi salva e será enviada quando houver internet.'
          : 'Sua resposta foi registrada.'}
      </p>
    </Centro>
  );

  // ---------- Formulário ----------
  return (
    <div className="tela">
      <header className="topo">
        <div className="marca">
          <div className="marca-mark">ISV</div>
          <div className="marca-txt">
            <span className="marca-n">{cfg.instituto?.nome || 'Instituto São Vicente'}</span>
            <span className="marca-s">{cfg.unidade?.nome}</span>
          </div>
        </div>
        <div className="passo-tag">Pergunta {passo + 1} de {perguntas.length}</div>
      </header>

      <main className="conteudo">
        <div className="ask">
          <div className="ask-q">{p.texto}</div>
          <div className="ask-s">{legenda(p.tipo)}</div>
        </div>

        {p.tipo === 'nps' && (
          <div className="nps">
            {NPS.map((n) => (
              <button key={n}
                className={'nps-b' + (val?.valor_num === n ? ' sel' : '')}
                style={val?.valor_num === n ? { background: corNps(n), borderColor: corNps(n), color: '#fff' } : undefined}
                onClick={() => definir({ valor_num: n })}>
                {n}
              </button>
            ))}
            <div className="nps-legenda"><span>Nada provável</span><span>Muito provável</span></div>
          </div>
        )}

        {p.tipo === 'estrela' && (
          <div className="estrelas">
            {ESTRELAS.map((s) => (
              <button key={s}
                className={'estrela' + ((val?.valor_num || 0) >= s ? ' on' : '')}
                aria-label={`${s} estrela${s > 1 ? 's' : ''}`}
                onClick={() => definir({ valor_num: s })}>★</button>
            ))}
          </div>
        )}

        {p.tipo === 'carinha' && (
          <div className="carinhas">
            {CARINHAS.map((c) => (
              <button key={c.v}
                className={'carinha' + (val?.valor_num === c.v ? ' sel' : '')}
                onClick={() => definir({ valor_num: c.v })}>
                <Face cor={c.cor} nivel={c.v} />
                <span className="carinha-l">{c.rot}</span>
              </button>
            ))}
          </div>
        )}

        {p.tipo === 'texto' && (
          <textarea className="texto" rows={4}
            placeholder="Escreva aqui (opcional)…"
            value={val?.valor_texto || ''}
            onChange={(e) => definir({ valor_texto: e.target.value })} />
        )}
      </main>

      <footer className="rodape">
        <button className="btn ghost" onClick={voltar} disabled={passo === 0}>Voltar</button>
        <div className="pontos">
          {perguntas.map((_, i) => <span key={i} className={'ponto' + (i === passo ? ' on' : '')} />)}
        </div>
        <button className="btn" onClick={avancar} disabled={!podeAvancar}>
          {passo === perguntas.length - 1 ? 'Enviar' : 'Próximo'}
        </button>
      </footer>

      {fila > 0 && <div className="offline-banner">{fila} resposta(s) aguardando envio</div>}
    </div>
  );
}

// ---------- auxiliares ----------
function Centro({ children }) { return <div className="tela centro">{children}</div>; }

function legenda(tipo) {
  if (tipo === 'nps') return 'Toque em uma nota de 0 a 10.';
  if (tipo === 'estrela') return 'Toque nas estrelas.';
  if (tipo === 'carinha') return 'Toque na carinha que representa o que você sentiu.';
  return 'Se quiser, deixe um comentário.';
}
const corNps = (n) => (n <= 6 ? '#A63A30' : n <= 8 ? '#DE8038' : '#0C6036');

function Face({ cor, nivel }) {
  const boca =
    nivel <= 1 ? 'M30 70 Q50 52 70 70'
    : nivel === 2 ? 'M31 68 Q50 60 69 68'
    : nivel === 3 ? 'M31 65 L69 65'
    : nivel === 4 ? 'M31 61 Q50 74 69 61'
    : 'M29 59 Q50 80 71 59';
  const olho = nivel === 2 || nivel === 3 ? '#3A2210' : '#fff';
  return (
    <svg viewBox="0 0 100 100" width="100%" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill={cor} />
      <circle cx="37" cy="41" r="5" fill={olho} />
      <circle cx="63" cy="41" r="5" fill={olho} />
      <path d={boca} fill="none" stroke={olho} strokeWidth="6.5" strokeLinecap="round" />
    </svg>
  );
}
