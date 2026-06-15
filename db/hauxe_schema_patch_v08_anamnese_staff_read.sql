-- =====================================================================
-- HAUXE — Patch v08 · Staff-read de anamnese-files (cast seguro)
-- =====================================================================
-- A policy "anamnese-files - staff lê" criada na v05 usava:
--   r.profile_id = (storage.foldername(name))[1]::uuid
-- O cast text → uuid lança exceção PostgreSQL quando o path não começa
-- com um UUID válido — mesmo padrão corrigido na v07 para ceremony-images.
--
-- Correção: r.profile_id::text = (storage.foldername(objects.name))[1]
-- Comparação texto/texto retorna false graciosamente para qualquer path
-- fora do formato; sem risco de exceção.
--
-- Escopo: apenas SELECT. INSERT/UPDATE/DELETE de staff: não criados.
-- is_org_member(c.org_id) já inclui is_super_admin() internamente.
-- =====================================================================

DROP POLICY IF EXISTS "anamnese-files - staff lê" ON storage.objects;

CREATE POLICY "anamnese-files - staff lê" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'anamnese-files'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.registrations r
      JOIN public.ceremonies c ON c.id = r.ceremony_id
      WHERE r.profile_id::text = (storage.foldername(objects.name))[1]
        AND public.is_org_member(c.org_id)
    )
  );
