import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { sessaoAtiva, parear } from './lib/isv';
import ColetaTotem from './ColetaTotem';
import PainelAdmin from './PainelAdmin';

/* Portão único de entrada: uma sessão (Supabase Auth) já resolve pra sempre
   quem é quem — o papel em usuario_perfil (ver db/01_schema.sql) diz se é
   'totem' (vai pra coleta) ou admin (vai pro painel). Como a sessão persiste
   no localStorage do aparelho/navegador, a escolha (admin vs totem) e o login
   ou pareamento só aparecem na PRIMEIRA vez — nas próximas cargas, avaliar()
   já acha a sessão e manda direto pra tela certa. */
export default function App() {
  const [estado, setEstado] = useState('carregando');
  // carregando | escolha | login-admin | parear | coleta | painel | erro
  const [erro, setErro] = useState('');

  async function avaliar() {
    setEstado('carregando');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setEstado('escolha'); return; }

      const { data: perfil, error } = await supabase
        .from('usuario_perfil').select('papel').eq('id', data.session.user.id).single();

      if (error) {
        // sessão existe mas ainda não tem perfil: só é normal pro totem
        // recém-entrado anônimo, que precisa parear antes de tudo.
        if (data.session.user.is_anonymous) { setEstado('parear'); return; }
        throw new Error('Sua conta não tem um perfil configurado neste instituto. Fale com o TI.');
      }

      setEstado(perfil.papel === 'totem' ? 'coleta' : 'painel');
    } catch (e) {
      setErro(e.message || String(e));
      setEstado('erro');
    }
  }

  useEffect(() => {
    avaliar();
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') avaliar();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function escolherTotem() {
    setEstado('carregando');
    try {
      await sessaoAtiva();
      await avaliar();
    } catch (e) {
      setErro(e.message || String(e));
      setEstado('erro');
    }
  }

  async function confirmarPareamento(codigo) {
    await parear(codigo);   // lança com mensagem amigável em caso de erro
    await avaliar();
  }

  if (estado === 'carregando') return <Centro><div className="spinner" /></Centro>;

  if (estado === 'escolha') return (
    <TelaEscolha onAdmin={() => setEstado('login-admin')} onTotem={escolherTotem} />
  );

  if (estado === 'login-admin') return (
    <TelaLoginAdmin onVoltar={() => setEstado('escolha')} onEntrar={avaliar} />
  );

  if (estado === 'parear') return <TelaPareamento onConfirmar={confirmarPareamento} />;

  if (estado === 'erro') return (
    <Centro>
      <h2>Não foi possível continuar</h2>
      <p className="erro">{erro}</p>
      <button className="btn" onClick={() => location.reload()}>Tentar de novo</button>
    </Centro>
  );

  if (estado === 'coleta') return <div className="v-coleta"><ColetaTotem /></div>;
  if (estado === 'painel') return <div className="v-painel"><PainelAdmin /></div>;
  return null;
}

/* ---------------- telas do portão ---------------- */

function Centro({ children }) { return <div className="v-gate tela centro">{children}</div>; }

function TelaEscolha({ onAdmin, onTotem }) {
  return (
    <Centro>
      <div className="marca-mark grande">ISV</div>
      <h1 className="ask-q">Pesquisa de Satisfação</h1>
      <p className="ask-s">Como você vai entrar?</p>
      <div className="escolha-botoes">
        <button className="btn" onClick={onAdmin}>Sou administrador</button>
        <button className="btn ghost" onClick={onTotem}>Sou o totem desta unidade</button>
      </div>
    </Centro>
  );
}

function TelaLoginAdmin({ onVoltar, onEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setIndo(true); setErro('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) { setErro('E-mail ou senha inválidos.'); setIndo(false); return; }
    await onEntrar();
  }

  return (
    <div className="v-gate login-tela">
      <form className="login" onSubmit={entrar}>
        <div className="marca-mark grande">ISV</div>
        <h1>Painel de satisfação</h1>
        <p className="ask-s">Entre com sua conta do instituto.</p>
        <input type="email" placeholder="E-mail" value={email} required
               onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input type="password" placeholder="Senha" value={senha} required
               onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
        {erro && <p className="erro">{erro}</p>}
        <button className="btn" disabled={indo}>{indo ? 'Entrando…' : 'Entrar'}</button>
        <button className="btn ghost" type="button" onClick={onVoltar} disabled={indo}>Voltar</button>
      </form>
    </div>
  );
}

function TelaPareamento({ onConfirmar }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setIndo(true); setErro('');
    try {
      await onConfirmar(codigo.trim());
    } catch (err) {
      setErro(err.message || String(err));
      setIndo(false);
    }
  }

  return (
    <Centro>
      <form className="pareamento" onSubmit={enviar}>
        <h1 className="ask-q">Parear este totem</h1>
        <p className="ask-s">
          Digite o código de 8 letras que o TI gerou para esta unidade.
          Isso só precisa ser feito uma vez neste aparelho.
        </p>
        <input
          className="pareamento-codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="XXXXXXXX"
          maxLength={8}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
        />
        {erro && <p className="erro">{erro}</p>}
        <button className="btn" disabled={indo || codigo.trim().length < 4}>
          {indo ? 'Pareando…' : 'Confirmar'}
        </button>
      </form>
    </Centro>
  );
}
