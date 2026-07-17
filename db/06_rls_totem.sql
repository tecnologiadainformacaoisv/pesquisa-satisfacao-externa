-- =============================================================
--  PRODUTO ISV — 06 · Ajuste de RLS para o papel 'totem'
--  O tablet (papel 'totem') deve GRAVAR respostas, mas NÃO LER
--  as respostas dos outros. Config (instituto/unidade/perguntas)
--  ele continua lendo, para renderizar o formulário.
--  Rode no SQL Editor depois do 02_rls.sql.
-- =============================================================

-- Leitura de RESPOSTA: todos do instituto, EXCETO o totem
drop policy if exists resposta_sel on resposta;
create policy resposta_sel on resposta for select using (
  is_super_admin()
  or (instituto_id = current_instituto_id() and current_papel() <> 'totem')
);

-- Leitura de RESPOSTA_ITEM: idem
drop policy if exists item_sel on resposta_item;
create policy item_sel on resposta_item for select using (
  is_super_admin()
  or (instituto_id = current_instituto_id() and current_papel() <> 'totem')
);

-- (INSERT de resposta/resposta_item pelo totem permanece como no 02_rls.sql)

-- =============================================================
--  Fim do 06_rls_totem.sql
-- =============================================================
