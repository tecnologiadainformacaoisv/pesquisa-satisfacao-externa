-- =============================================================
--  PRODUTO ISV — 10 · Pareamento do totem (fecha o 🔴 4)
--  Rode no SQL Editor (idempotente).
--
--  O PROBLEMA
--  O app de coleta carregava e-mail/senha do totem em VITE_TOTEM_*,
--  que o Vite EMBUTE no bundle JS — não é segredo, é texto plano
--  visível em qualquer devtools. A mesma senha de todos os tablets,
--  publicada no HTML de produção. Quem a lesse podia gravar respostas
--  fabricadas em qualquer unidade do instituto.
--
--  A SAÍDA: pareamento por código de uso único
--  1. O tablet abre e se autentica ANONIMAMENTE (supabase.auth
--     .signInAnonymously) — sem nenhuma credencial embutida no bundle.
--  2. Esse usuário anônimo ainda não tem usuario_perfil, então não
--     passa em NENHUMA política de escrita.
--  3. O TI gera um código (scripts/gerar-codigo-totem.mjs, com
--     service_role) e digita uma vez, à mão, no tablet físico.
--  4. A RPC parear_totem() valida o código e vincula o auth.uid()
--     anônimo — só ELE, o dispositivo que está na sua frente — a um
--     usuario_perfil papel='totem' da unidade certa.
--  5. Sessão persiste no localStorage do navegador do tablet: o
--     pareamento acontece uma vez por aparelho.
--
--  Depois de pareado, o resto do modelo de segurança (07/08/09) não
--  muda nada: current_papel()/current_instituto_id()/current_unidade_id()
--  continuam lendo o mesmo usuario_perfil, só que agora o id é o de um
--  auth.users anônimo em vez do e-mail/senha compartilhado.
-- =============================================================

-- -------------------------------------------------------------
--  Tabela dos códigos (nunca legível pelo totem — só por admins
--  do instituto, e mesmo assim só para emitir/consultar os seus).
-- -------------------------------------------------------------
create table if not exists totem_pareamento (
  id            uuid primary key default gen_random_uuid(),
  instituto_id  uuid not null references instituto(id) on delete cascade,
  unidade_id    uuid not null references unidade(id) on delete cascade,
  codigo        text not null unique,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  usado_em      timestamptz,
  usado_por     uuid references auth.users(id) on delete set null
);
create index if not exists idx_pareamento_instituto on totem_pareamento(instituto_id);

alter table totem_pareamento enable row level security;

-- Admins do instituto veem/emitem códigos da própria casa. Sem policy
-- de update/delete: marcar como usado é feito pela RPC (security
-- definer), não por acesso direto do cliente.
drop policy if exists pareamento_sel on totem_pareamento;
create policy pareamento_sel on totem_pareamento for select using (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio','admin_unidade'))
);
drop policy if exists pareamento_ins on totem_pareamento;
create policy pareamento_ins on totem_pareamento for insert with check (
  is_super_admin() or (instituto_id = current_instituto_id()
    and current_papel() in ('admin_instituto','admin_municipio','admin_unidade'))
);

-- -------------------------------------------------------------
--  RPC de pareamento — o único jeito de virar 'totem'.
--
--  SECURITY DEFINER de propósito: quem chama ainda não tem
--  usuario_perfil (é por isso que precisa parear!), então não passaria
--  em nenhuma política normal. A função lê totem_pareamento por conta
--  própria e só grava um usuario_perfil vinculado ao PRÓPRIO auth.uid()
--  do chamador — nunca a um id arbitrário passado por parâmetro.
-- -------------------------------------------------------------
create or replace function parear_totem(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_par record;
begin
  if v_uid is null then
    raise exception 'sessao ausente: entre (mesmo que anonimamente) antes de parear';
  end if;

  select * into v_par from totem_pareamento
    where codigo = upper(trim(p_codigo)) and usado_em is null and expira_em > now()
    for update;

  if v_par.id is null then
    raise exception 'codigo invalido ou expirado';
  end if;

  insert into usuario_perfil (id, instituto_id, unidade_id, papel, nome, ativo)
  values (
    v_uid, v_par.instituto_id, v_par.unidade_id, 'totem',
    'Totem — ' || (select nome from unidade where id = v_par.unidade_id),
    true
  )
  on conflict (id) do update set
    instituto_id = excluded.instituto_id,
    unidade_id   = excluded.unidade_id,
    papel        = 'totem',
    ativo        = true;

  update totem_pareamento set usado_em = now(), usado_por = v_uid where id = v_par.id;

  return jsonb_build_object(
    'instituto', (select nome from instituto where id = v_par.instituto_id),
    'unidade',   (select nome from unidade where id = v_par.unidade_id)
  );
end $$;

revoke all on function parear_totem(text) from public, anon;
grant execute on function parear_totem(text) to authenticated;

-- =============================================================
--  PASSO MANUAL OBRIGATÓRIO (não dá para fazer por SQL):
--  Painel do Supabase → Authentication → Sign In / Providers →
--  ative "Allow anonymous sign-ins". Sem isso, signInAnonymously()
--  falha com anonymous_provider_disabled.
--
--  Depois de rodar este arquivo E ativar o toggle acima:
--    node produto-isv/scripts/gerar-codigo-totem.mjs "UBS Centro"
--    node produto-isv/scripts/revogar-totem-antigo.mjs
--    node produto-isv/scripts/testar-seguranca.mjs
-- =============================================================
