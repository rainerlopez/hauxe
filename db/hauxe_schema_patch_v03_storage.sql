-- =====================================================================
-- HAUXE — Patch v0.3 · Storage buckets + policies
-- Aplica as policies que o schema v0.1 deixou como lembrete (linhas 411-415).
-- Rode no SQL Editor do Supabase (precisa de privilégio sobre storage.*).
--
-- CONVENÇÃO DE CAMINHOS (importante para as policies abaixo):
--   ceremony-images/{ceremony_id}/{arquivo}   → 1ª pasta = ceremony_id
--   anamnese-files/{profile_id}/{arquivo}      → 1ª pasta = profile_id (= auth.uid)
-- As policies usam storage.foldername(name)[1] para extrair esse id.
-- =====================================================================

-- ---------- Buckets (idempotente) ----------
insert into storage.buckets (id, name, public)
values
  ('ceremony-images', 'ceremony-images', true),   -- flyers: leitura pública
  ('anamnese-files',  'anamnese-files',  false)   -- anexos de saúde: privado
on conflict (id) do update set public = excluded.public;

-- =====================================================================
-- CEREMONY-IMAGES — leitura pública; escrita só pela equipe do espaço
-- (org_member da org dona da cerimônia indicada no caminho).
-- =====================================================================
drop policy if exists "ceremony-images public read"   on storage.objects;
drop policy if exists "ceremony-images staff write"    on storage.objects;
drop policy if exists "ceremony-images staff update"   on storage.objects;
drop policy if exists "ceremony-images staff delete"   on storage.objects;

create policy "ceremony-images public read" on storage.objects
  for select using (bucket_id = 'ceremony-images');

create policy "ceremony-images staff write" on storage.objects
  for insert with check (
    bucket_id = 'ceremony-images'
    and exists (
      select 1 from ceremonies c
      where c.id = (storage.foldername(name))[1]::uuid
        and is_org_member(c.org_id)
    )
  );

create policy "ceremony-images staff update" on storage.objects
  for update using (
    bucket_id = 'ceremony-images'
    and exists (
      select 1 from ceremonies c
      where c.id = (storage.foldername(name))[1]::uuid
        and is_org_member(c.org_id)
    )
  );

create policy "ceremony-images staff delete" on storage.objects
  for delete using (
    bucket_id = 'ceremony-images'
    and exists (
      select 1 from ceremonies c
      where c.id = (storage.foldername(name))[1]::uuid
        and is_org_member(c.org_id)
    )
  );

-- =====================================================================
-- ANAMNESE-FILES — privado. Espelha a RLS de `anamneses`:
--   • o DONO (profile_id = auth.uid) faz tudo nos próprios arquivos;
--   • a EQUIPE do espaço LÊ quando a pessoa tem inscrição naquela org.
-- =====================================================================
drop policy if exists "anamnese-files owner all"        on storage.objects;
drop policy if exists "anamnese-files staff read"        on storage.objects;

create policy "anamnese-files owner all" on storage.objects
  for all
  using (
    bucket_id = 'anamnese-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'anamnese-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "anamnese-files staff read" on storage.objects
  for select using (
    bucket_id = 'anamnese-files'
    and exists (
      select 1 from registrations r
      join ceremonies c on c.id = r.ceremony_id
      where r.profile_id = (storage.foldername(name))[1]::uuid
        and is_org_member(c.org_id)
    )
  );

-- =====================================================================
-- NOTA: a service_role (Edge Functions) ignora estas policies.
-- =====================================================================
