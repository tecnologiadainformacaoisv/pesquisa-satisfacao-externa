-- =============================================================
--  PRODUTO ISV — 17 · Branding por instituto (Fase 3)
--  Rode no SQL Editor.
--
--  Duas coisas novas:
--  1) Bucket de Storage "logos" (público pra leitura, só admin do
--     próprio instituto ou operador sobem/trocam o arquivo).
--  2) View pública de branding (slug, nome, logo_url, cor_acento) —
--     de propósito SEM security_invoker, pra rodar como o dono da view
--     e ignorar a RLS normal de "instituto" (que exige login). É a
--     exposição mínima: só os 4 campos visuais, nada sensível, usada
--     pela tela de entrada (App.jsx) quando aberta com ?i=<slug> —
--     link direto e com a cara de cada instituto, sem subdomínio de
--     verdade (decisão tomada em 23/07/2026: DNS/domínio próprio fica
--     pra quando houver instituto pagante).
-- =============================================================

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists logos_select_publico on storage.objects;
create policy logos_select_publico on storage.objects for select using (
  bucket_id = 'logos'
);

drop policy if exists logos_escreve_admin on storage.objects;
create policy logos_escreve_admin on storage.objects for insert with check (
  bucket_id = 'logos'
  and (
    is_super_admin()
    or (current_papel() = 'admin_instituto' and (storage.foldername(name))[1] = current_instituto_id()::text)
  )
);

drop policy if exists logos_atualiza_admin on storage.objects;
create policy logos_atualiza_admin on storage.objects for update using (
  bucket_id = 'logos'
  and (
    is_super_admin()
    or (current_papel() = 'admin_instituto' and (storage.foldername(name))[1] = current_instituto_id()::text)
  )
);

create or replace view vw_instituto_publico as
select slug, nome, logo_url, cor_acento
from instituto
where ativo = true;

grant select on vw_instituto_publico to anon, authenticated;

-- =============================================================
--  Fim do 17_branding_publico.sql
-- =============================================================
