-- =====================================================================
-- Suite 01 · RLS de conductors (v06)
-- =====================================================================
-- Cobre: org_admin escreve; membro não-admin NÃO escreve; membro lê;
--        usuário sem org NÃO lê.
-- Auto-contido + transacional (ROLLBACK). Ver db/tests/README.md p/ execução.
--
-- Fixtures (UUIDs sintéticos):
--   ORG_A   a0000000-…-0001   ORG_B   b0000000-…-0002
--   ADMIN_A a1110000-…-0001 (org_admin de A)
--   MEMBER_A a2220000-…-0002 (role 'conductor' em A — membro, não admin)
--   ADMIN_B b1110000-…-0001 (org_admin de B)
--   NONE    00000000-…-00ff (authenticated, sem org)
--   COND_A1 ca100000-…-0001 (conductor de A)
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

-- ---------- fixtures (papel privilegiado) ----------
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('a1110000-0000-0000-0000-000000000001','suite_admin_a@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a2220000-0000-0000-0000-000000000002','suite_member_a@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('b1110000-0000-0000-0000-000000000001','suite_admin_b@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000ff','suite_none@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a'),
  ('b0000000-0000-0000-0000-000000000002','SUITE_Org_B','suite-org-b');

INSERT INTO org_members (org_id, profile_id, role) VALUES
  ('a0000000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000001','org_admin'),
  ('a0000000-0000-0000-0000-000000000001','a2220000-0000-0000-0000-000000000002','conductor'),
  ('b0000000-0000-0000-0000-000000000002','b1110000-0000-0000-0000-000000000001','org_admin');

INSERT INTO conductors (id, org_id, name, active) VALUES
  ('ca100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','SUITE_Cond_A1', true);

-- ---------- asserções ----------

-- a1) membro (não-admin) da org A LÊ conductor da própria org
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a2220000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM conductors WHERE id='ca100000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a1) membro lê conductor da própria org','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- a2) usuário SEM org NÃO lê (RLS filtra → 0 linhas)
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM conductors WHERE id='ca100000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a2) sem-org não lê conductor','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- a3) org_admin de A INSERE conductor na própria org → permitido
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO conductors (org_id, name) VALUES ('a0000000-0000-0000-0000-000000000001','SUITE_Cond_NovoAdmin');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a3) org_admin insere na própria org','permitido','permitido','PASS');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a3) org_admin insere na própria org','permitido','bloqueado','FAIL');
END $$;

-- a4) membro NÃO-admin tenta INSERIR conductor → bloqueado (policy exige org_admin)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a2220000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO conductors (org_id, name) VALUES ('a0000000-0000-0000-0000-000000000001','SUITE_Cond_MembroNaoAdmin');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a4) membro não-admin NÃO insere','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a4) membro não-admin NÃO insere','bloqueado','bloqueado (42501)','PASS');
END $$;

-- a5) org_admin de OUTRA org (B) tenta INSERIR conductor em A → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO conductors (org_id, name) VALUES ('a0000000-0000-0000-0000-000000000001','SUITE_Cond_AdminBoutroOrg');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a5) admin de outra org NÃO insere em A','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a5) admin de outra org NÃO insere em A','bloqueado','bloqueado (42501)','PASS');
END $$;

-- a6) org_admin de A ATUALIZA conductor (soft-delete: active=false) → permitido (1 linha)
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE conductors SET active=false WHERE id='ca100000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a6) org_admin soft-delete (active=false)','1 linha',n::text||' linha', CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- a7) org_admin de B tenta ATUALIZAR conductor de A → RLS filtra (0 linhas afetadas)
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE conductors SET name='SUITE_HACK' WHERE id='ca100000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('conductors RLS','a7) admin de outra org NÃO atualiza A','0 linhas',n::text||' linhas', CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
