-- =====================================================================
-- HAUXE — Patch v09 · Fundações de gestão de cerimônias (Fase 3a)
-- =====================================================================
-- Escopo: APENAS banco. Vagas (enforcement anti-race), condutores N:N e
-- orientações por cerimônia. Nenhuma UI. NÃO toca pagamento/contribuição.
--
-- Estado encontrado na introspecção (reconciliação, não recriação):
--   • ceremonies.capacity JÁ EXISTE (integer NULL) com CHECK idêntico
--     (capacity IS NULL OR capacity > 0) → mantido, não recriado.
--   • ceremony_conductors JÁ EXISTE (PK composta, FK ceremony CASCADE).
--     Ajustes: + created_at, FK conductor CASCADE→RESTRICT, índice em
--     conductor_id, e policies de escrita migradas para o padrão org_admin
--     (v06). Policy de leitura mantida intacta (exposição pública = Fase 3b).
--
-- Status de registration que OCUPAM vaga (default de insert = 'reservada'):
--   reservada, pendente, aguardando_pagamento, confirmada, check_in
-- NÃO ocupam: cancelada (libera), lista_espera (espera porque está cheio).
--
-- Interação com o fluxo assíncrono:
--   refresh_registration_status() só transita reservada↔confirmada (ambos
--   ocupam). O enforcement abaixo só valida quando a linha ENTRA em
--   ocupação (INSERT ou não-ocupante→ocupante), então a confirmação
--   automática nunca é bloqueada por capacidade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ceremonies: capacity já existe (mantido). Adicionar orientations.
--    (description já existe, mas é a descrição pública/marketing — campo
--     distinto; orientations = instruções pré-evento editáveis.)
-- ---------------------------------------------------------------------
ALTER TABLE ceremonies
  ADD COLUMN IF NOT EXISTS orientations text NULL;

-- ---------------------------------------------------------------------
-- 2. ceremony_conductors: reconciliar com o spec da Fase 3a
-- ---------------------------------------------------------------------
-- 2a. created_at (ausente na tabela pré-existente)
ALTER TABLE ceremony_conductors
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 2b. FK conductor_id: CASCADE → RESTRICT
--     Protege contra remoção acidental de condutor vinculado a cerimônia.
ALTER TABLE ceremony_conductors
  DROP CONSTRAINT IF EXISTS ceremony_conductors_conductor_id_fkey;
ALTER TABLE ceremony_conductors
  ADD CONSTRAINT ceremony_conductors_conductor_id_fkey
    FOREIGN KEY (conductor_id) REFERENCES conductors(id) ON DELETE RESTRICT;

-- 2c. Índice na FK conductor_id (a PK já cobre ceremony_id primeiro)
CREATE INDEX IF NOT EXISTS idx_ceremony_conductors_conductor_id
  ON ceremony_conductors(conductor_id);

-- 2d. Policies de escrita: migrar de "staff manage" (ALL/is_org_member)
--     para o padrão org_admin da v06. Leitura mantida intacta.
DROP POLICY IF EXISTS "ceremony_conductors - staff manage"      ON ceremony_conductors;
DROP POLICY IF EXISTS "ceremony_conductors - org_admin insert"  ON ceremony_conductors;
DROP POLICY IF EXISTS "ceremony_conductors - org_admin delete"  ON ceremony_conductors;

CREATE POLICY "ceremony_conductors - org_admin insert" ON ceremony_conductors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ceremonies c
      JOIN org_members om ON om.org_id = c.org_id
      WHERE c.id = ceremony_conductors.ceremony_id
        AND om.profile_id = (SELECT auth.uid())
        AND om.role = 'org_admin'
    )
    OR is_super_admin()
  );

CREATE POLICY "ceremony_conductors - org_admin delete" ON ceremony_conductors
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM ceremonies c
      JOIN org_members om ON om.org_id = c.org_id
      WHERE c.id = ceremony_conductors.ceremony_id
        AND om.profile_id = (SELECT auth.uid())
        AND om.role = 'org_admin'
    )
    OR is_super_admin()
  );

-- ---------------------------------------------------------------------
-- 3. Enforcement de vagas (anti-race) em registrations
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: a contagem precisa enxergar TODAS as inscrições da
-- cerimônia, além da RLS do participante (que só vê as próprias). Sem
-- DEFINER, um participante contaria apenas a si mesmo e furaria a vaga.
-- SET search_path = '' + REVOKE EXECUTE FROM PUBLIC: padrão do projeto.
CREATE OR REPLACE FUNCTION public.check_ceremony_capacity()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_capacity integer;
  v_count    integer;
  v_occupying public.registration_status[] := ARRAY[
    'reservada','pendente','aguardando_pagamento','confirmada','check_in'
  ]::public.registration_status[];
BEGIN
  -- Só enforce quando a linha ENTRA em ocupação de vaga.
  IF NOT (NEW.status = ANY (v_occupying)) THEN
    RETURN NEW;  -- status sem ocupação (cancelada/lista_espera): libera
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.status = ANY (v_occupying)) THEN
    RETURN NEW;  -- já ocupava (ex.: reservada->confirmada): sem nova vaga
  END IF;

  -- Trava a cerimônia: serializa inscrições concorrentes na mesma cerimônia.
  SELECT capacity INTO v_capacity
    FROM public.ceremonies
   WHERE id = NEW.ceremony_id
   FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN NEW;  -- sem limite
  END IF;

  SELECT count(*) INTO v_count
    FROM public.registrations
   WHERE ceremony_id = NEW.ceremony_id
     AND id <> NEW.id
     AND status = ANY (v_occupying);

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'ceremony_full'
      USING HINT = 'A cerimônia atingiu a capacidade máxima.';
  END IF;

  RETURN NEW;
END;
$$;

-- Função SÓ de trigger (nunca chamada via RPC): revoga de PUBLIC e dos roles
-- anon/authenticated que o Supabase concede por padrão — não expõe via /rpc
-- e mantém o Security Advisor limpo. O trigger executa independente de grant.
REVOKE EXECUTE ON FUNCTION public.check_ceremony_capacity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ceremony_capacity ON registrations;
CREATE TRIGGER trg_ceremony_capacity
  BEFORE INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION public.check_ceremony_capacity();

-- ---------------------------------------------------------------------
-- 4. Fechar gap (f): conductor e ceremony devem ser da mesma org
-- ---------------------------------------------------------------------
-- SECURITY INVOKER deliberado — não DEFINER:
--   • INSERT passa pela policy "org_admin insert" só se o ator for org_admin
--     da org da cerimônia → ceremonies.org_id sempre visível no trigger.
--   • Condutor de outra org está oculto pela policy "conductors - read"
--     (filtra por is_org_member) → SELECT retorna NULL → NULL IS DISTINCT
--     FROM <ceremony_org> = TRUE → exception. Sem escalada de privilégio.
--   • Service_role/postgres (bypassa RLS): vê ambas as linhas → comparação
--     direta; funciona igualmente.
DROP TRIGGER   IF EXISTS trg_ceremony_conductor_same_org ON ceremony_conductors;
DROP FUNCTION  IF EXISTS public.enforce_ceremony_conductor_same_org();

CREATE OR REPLACE FUNCTION public.enforce_ceremony_conductor_same_org()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''  -- previne search_path injection mesmo com INVOKER
  -- SECURITY INVOKER (padrão) — ver comentário acima
AS $$
DECLARE
  v_conductor_org uuid;
  v_ceremony_org  uuid;
BEGIN
  SELECT org_id INTO v_conductor_org FROM public.conductors WHERE id = NEW.conductor_id;
  SELECT org_id INTO v_ceremony_org  FROM public.ceremonies  WHERE id = NEW.ceremony_id;

  IF v_conductor_org IS DISTINCT FROM v_ceremony_org THEN
    RAISE EXCEPTION 'conductor_org_mismatch'
      USING HINT = 'O condutor não pertence à mesma organização da cerimônia.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ceremony_conductor_same_org
  BEFORE INSERT OR UPDATE ON ceremony_conductors
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ceremony_conductor_same_org();
