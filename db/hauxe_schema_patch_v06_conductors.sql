-- =====================================================================
-- HAUXE — Patch v0.6 · Condutores: colunas, índice, trigger, RLS
-- =====================================================================
-- A tabela conductors já existia no schema v01 com: id, org_id, name,
-- bio, avatar_url, created_at. Faltavam active, updated_at, trigger e
-- policies granulares por role.
--
-- Decisões de design:
--   • Soft-delete via active=false (UI) — DELETE é escape hatch.
--   • Leitura restrita a is_org_member (sem exposição pública por
--     cerimônia publicada — removida intencionalmente nesta migration).
--   • Escrita (INSERT/UPDATE/DELETE) somente org_admin da org ou super_admin.
--   • WITH CHECK omitido no UPDATE: USING basta — impede mover condutor
--     para outra org pela ausência de WITH CHECK distinto.
-- =====================================================================

-- 1. Colunas (idempotente) -----------------------------------------
ALTER TABLE conductors
  ADD COLUMN IF NOT EXISTS active     boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Índice na FK (listagens e RLS filtram por org) ------------------
CREATE INDEX IF NOT EXISTS idx_conductors_org_id ON conductors(org_id);

-- 3. Trigger updated_at ---------------------------------------------
--    Drop antes do backfill para não disparar set_updated_at nas linhas
--    existentes e sobrescrever o valor que queremos (= created_at).
DROP TRIGGER IF EXISTS trg_conductor_updated ON conductors;
UPDATE conductors SET updated_at = created_at;
CREATE TRIGGER trg_conductor_updated
  BEFORE UPDATE ON conductors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Policies de escrita: somente org_admin ou super_admin -----------
DROP POLICY IF EXISTS "conductors - staff manage"     ON conductors;
DROP POLICY IF EXISTS "conductors - org_admin insert" ON conductors;
DROP POLICY IF EXISTS "conductors - org_admin update" ON conductors;
DROP POLICY IF EXISTS "conductors - org_admin delete" ON conductors;

CREATE POLICY "conductors - org_admin insert" ON conductors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id    = conductors.org_id
        AND profile_id = (SELECT auth.uid())
        AND role      = 'org_admin'
    )
    OR is_super_admin()
  );

CREATE POLICY "conductors - org_admin update" ON conductors
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id    = conductors.org_id
        AND profile_id = (SELECT auth.uid())
        AND role      = 'org_admin'
    )
    OR is_super_admin()
  );

CREATE POLICY "conductors - org_admin delete" ON conductors
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id    = conductors.org_id
        AND profile_id = (SELECT auth.uid())
        AND role      = 'org_admin'
    )
    OR is_super_admin()
  );

-- 5. Leitura: somente membros da org (remove cláusula pública) ------
DROP POLICY IF EXISTS "conductors - read" ON conductors;
CREATE POLICY "conductors - read" ON conductors
  FOR SELECT USING ( is_org_member(org_id) );
