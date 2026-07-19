-- =====================================================================
-- Hauxe · Patch v03b — Histórico de revisões da anamnese (LGPD)
-- =====================================================================
-- RESGATE DE VERSIONAMENTO (2026-07-19): este objeto foi aplicado em
-- produção em 2026-06-03 (migration 20260603132919/20260603173303,
-- nome "anamnese_revision_trigger") mas nunca chegou ao git. Conteúdo
-- recuperado verbatim de supabase_migrations.schema_migrations e
-- versionado aqui na posição cronológica correta (entre v03 e v04).
-- JÁ APLICADO em produção — não reaplicar lá; necessário apenas para
-- reconstruir ambientes novos (local/staging) a partir do repo.
--
-- Idempotente (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- =====================================================================

-- Snapshot da versão anterior da anamnese sempre que uma ficha JÁ consentida é editada.
-- anamnese_revisions não tem policy de INSERT para cliente; este trigger roda como
-- SECURITY DEFINER, garantindo o histórico sem expor INSERT direto.
CREATE OR REPLACE FUNCTION public.snapshot_anamnese_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- só registra histórico quando a ficha anterior já estava consentida (edição real)
  IF OLD.consent_health_data IS TRUE THEN
    INSERT INTO anamnese_revisions (anamnese_id, snapshot, changed_by)
    VALUES (OLD.id, to_jsonb(OLD), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anamnese_revision ON public.anamneses;
CREATE TRIGGER trg_anamnese_revision
  AFTER UPDATE ON public.anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_anamnese_revision();
