-- =====================================================================
-- HAUXE — Patch v07 · Storage policies para avatares de condutores
-- =====================================================================
-- As policies existentes de ceremony-images verificam foldername()[1]
-- como ceremony_id (JOIN na tabela ceremonies). Avatares de condutores
-- ficam em conductors/{org_id}/{conductor_id}.jpg — prefixo diferente,
-- portanto precisam de policies próprias.
--
-- Path convention: conductors/{org_id}/{conductor_id}.jpg
--   (storage.foldername(name))[1] = 'conductors'  (literal)
--   (storage.foldername(name))[2] = org_id         (uuid)
--
-- Leitura NÃO toca: bucket já é público (ceremony-images - leitura pública).
-- =====================================================================

DROP POLICY IF EXISTS "ceremony-images - conductor avatar insert" ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images - conductor avatar update" ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images - conductor avatar delete" ON storage.objects;

-- INSERT: org_admin (ou super_admin via is_org_member) faz upload de avatar
CREATE POLICY "ceremony-images - conductor avatar insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'conductors'
    AND is_org_member(((storage.foldername(name))[2])::uuid)
  );

-- UPDATE: substitui avatar existente (upsert via supabase-js usa UPDATE)
CREATE POLICY "ceremony-images - conductor avatar update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'conductors'
    AND is_org_member(((storage.foldername(name))[2])::uuid)
  );

-- DELETE: remove avatar (ex.: ao trocar foto ou ao remover explicitamente)
CREATE POLICY "ceremony-images - conductor avatar delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'conductors'
    AND is_org_member(((storage.foldername(name))[2])::uuid)
  );

-- =====================================================================
-- CORREÇÃO DAS POLICIES EXISTENTES DE ceremony-images (staff-ceremony)
-- =====================================================================
-- As policies criadas na v05 faziam (foldername(name))[1]::uuid sem guard.
-- Quando o primeiro folder não é um UUID (ex.: 'conductors'), o cast
-- lançava exceção PostgreSQL, bloqueando TODOS os uploads no bucket.
-- Corrigido: c.id::text = foldername()[1] — comparação texto/texto que
-- retorna false graciosamente para valores não-UUID.
-- =====================================================================

DROP POLICY IF EXISTS "ceremony-images - staff faz upload" ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images - staff atualiza"   ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images - staff deleta"     ON storage.objects;

CREATE POLICY "ceremony-images - staff faz upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.ceremonies c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_org_member(c.org_id)
    )
  );

CREATE POLICY "ceremony-images - staff atualiza" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.ceremonies c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_org_member(c.org_id)
    )
  );

CREATE POLICY "ceremony-images - staff deleta" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.ceremonies c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_org_member(c.org_id)
    )
  );
