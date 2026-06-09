-- =====================================================================
-- HAUXE — Patch v0.5 · Reconciliação de Storage Policies
-- =====================================================================
-- Problema encontrado (2026-06-09):
--   As policies de escrita de ceremony-images usavam foldername()[1] como
--   org_id, mas a convenção é {ceremony_id}/arquivo. Isso fazia com que
--   is_org_member(ceremony_id) sempre retornasse false — staff não
--   conseguia fazer upload de imagens.
--   Além disso: staff não podia LER anexos de saúde (anamnese-files)
--   de inscritos da própria org.
--
-- Esta migration:
--   1. Dropa as 2 policies erradas de ceremony-images.
--   2. Recria-as com lógica correta (join ceremonies → is_org_member(c.org_id)).
--   3. Cria policy UPDATE para ceremony-images (estava ausente).
--   4. Cria policy SELECT staff para anamnese-files (pendência do v03).
--
-- Resultado final (8 policies de storage):
--   anamnese-files — dono lê          (SELECT — dono)       [mantida]
--   anamnese-files — dono faz upload   (INSERT — dono)       [mantida]
--   anamnese-files — dono deleta       (DELETE — dono)       [mantida]
--   anamnese-files — staff lê          (SELECT — staff org)  [NOVA]
--   ceremony-images — leitura pública  (SELECT — todos)      [mantida]
--   ceremony-images — staff faz upload (INSERT — staff org)  [recriada]
--   ceremony-images — staff atualiza   (UPDATE — staff org)  [NOVA]
--   ceremony-images — staff deleta     (DELETE — staff org)  [recriada]
-- =====================================================================

-- ---------- Dropar policies com lógica errada ----------
drop policy if exists "ceremony-images - staff faz upload" on storage.objects;
drop policy if exists "ceremony-images - staff deleta"     on storage.objects;

-- ---------- Recriar ceremony-images (folder = ceremony_id) ----------
create policy "ceremony-images - staff faz upload" on storage.objects
  for insert with check (
    bucket_id = 'ceremony-images'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.ceremonies c
      where c.id = (storage.foldername(name))[1]::uuid
        and public.is_org_member(c.org_id)
    )
  );

create policy "ceremony-images - staff atualiza" on storage.objects
  for update using (
    bucket_id = 'ceremony-images'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.ceremonies c
      where c.id = (storage.foldername(name))[1]::uuid
        and public.is_org_member(c.org_id)
    )
  );

create policy "ceremony-images - staff deleta" on storage.objects
  for delete using (
    bucket_id = 'ceremony-images'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.ceremonies c
      where c.id = (storage.foldername(name))[1]::uuid
        and public.is_org_member(c.org_id)
    )
  );

-- ---------- Nova: staff lê anexos de saúde dos inscritos da própria org ----------
-- Espelha a lógica de "anamnese - org staff when registered" da tabela pública.
create policy "anamnese-files - staff lê" on storage.objects
  for select using (
    bucket_id = 'anamnese-files'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.registrations r
      join public.ceremonies c on c.id = r.ceremony_id
      where r.profile_id = (storage.foldername(name))[1]::uuid
        and public.is_org_member(c.org_id)
    )
  );
