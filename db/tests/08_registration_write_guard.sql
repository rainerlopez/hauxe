-- =====================================================================
-- Suite 08 · Guard de escrita em registrations (v13 · C2/D1/D2)
-- =====================================================================
-- Trigger trg_registration_write_guard (BEFORE INSERT OR UPDATE):
--   dono pode: INSERT nascendo 'reservada'; cancelar; reinscrever
--   (cancelada→reservada); editar brings_food/notes; trocar tier_id
--   enquanto não houver pagamento 'pago'.
--   dono NÃO pode: auto-promover status, trocar ceremony_id, mexer no resto.
--   staff da org: livre (exceto ceremony_id). Escritas aninhadas dos
--   triggers de sync (depth>1) e sem JWT (service/postgres): livres.
-- Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('a1110000-0000-0000-0000-000000000001','suite_admin_a@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000001','suite_p1@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000002','suite_p2@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a');

INSERT INTO org_members (org_id, profile_id, role) VALUES
  ('a0000000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000001','org_admin');

INSERT INTO ceremonies (id, org_id, title, status, starts_at, capacity) VALUES
  ('ce100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','SUITE_Cer_A','publicada', now() + interval '20 days', NULL),
  ('ce300000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','SUITE_Cer_B','publicada', now() + interval '25 days', NULL);

INSERT INTO contribution_tiers (id, ceremony_id, label, amount, sort_order) VALUES
  ('11e70000-0000-0000-0000-000000000001','ce100000-0000-0000-0000-000000000001','SUITE_T1',160,1),
  ('11e70000-0000-0000-0000-000000000002','ce100000-0000-0000-0000-000000000001','SUITE_T2',180,2);

-- R1: inscrição de P1 na Cer A (semente privilegiada — sem JWT, guard libera)
INSERT INTO registrations (id, ceremony_id, profile_id) VALUES
  ('de800000-0000-0000-0000-000000000001','ce100000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
-- R2: inscrição de P2 na Cer A
INSERT INTO registrations (id, ceremony_id, profile_id) VALUES
  ('de800000-0000-0000-0000-000000000002','ce100000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');

-- g01) dono tenta INSERT já 'confirmada' → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO registrations (ceremony_id, profile_id, status)
  VALUES ('ce300000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000002','confirmada');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g01) dono INSERT nascendo confirmada','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g01) dono INSERT nascendo confirmada','bloqueado','bloqueado (42501)','PASS');
END $$;

-- g02) dono INSERT default → permitido (nasce reservada)
DO $$
DECLARE s text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO registrations (ceremony_id, profile_id)
  VALUES ('ce300000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000002');
  SELECT status::text INTO s FROM registrations
   WHERE ceremony_id='ce300000-0000-0000-0000-000000000003' AND profile_id='d0000000-0000-0000-0000-000000000002';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g02) dono INSERT default','reservada',s, CASE WHEN s='reservada' THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g02) dono INSERT default','reservada','bloqueado','FAIL');
END $$;

-- g03) dono tenta status → confirmada → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET status='confirmada' WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g03) dono status→confirmada','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g03) dono status→confirmada','bloqueado','bloqueado (42501)','PASS');
END $$;

-- g04) dono tenta status → check_in → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET status='check_in' WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g04) dono status→check_in','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g04) dono status→check_in','bloqueado','bloqueado (42501)','PASS');
END $$;

-- g05) dono edita brings_food + notes → permitido
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET brings_food=true, notes='SUITE levo fruta'
   WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g05) dono edita brings_food/notes','permitido','permitido','PASS');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g05) dono edita brings_food/notes','permitido','bloqueado','FAIL');
END $$;

-- g06) dono troca tier SEM pagamento pago → permitido
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET tier_id='11e70000-0000-0000-0000-000000000001'
   WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g06) dono troca tier (sem pagamento)','permitido','permitido','PASS');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g06) dono troca tier (sem pagamento)','permitido','bloqueado','FAIL');
END $$;

-- pagamento pago de R1 (semente privilegiada; dispara sync → ficha ainda não ok)
INSERT INTO payments (registration_id, amount, status) VALUES
  ('de800000-0000-0000-0000-000000000001', 160, 'pago');

-- g07) REGRESSÃO do depth: dono preenche a ficha (consent) e o sync interno
-- promove a inscrição a 'confirmada' MESMO com o guard ativo (depth>1)
DO $$
DECLARE s text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO anamneses (profile_id, consent_health_data, consent_at)
  VALUES ('d0000000-0000-0000-0000-000000000001', true, now());
  SELECT status::text INTO s FROM registrations WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g07) sync interno promove com guard ativo','confirmada',s, CASE WHEN s='confirmada' THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g07) sync interno promove com guard ativo','confirmada','erro: '||SQLERRM,'FAIL');
END $$;

-- g08) dono troca tier COM pagamento pago → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET tier_id='11e70000-0000-0000-0000-000000000002'
   WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g08) dono troca tier (já pago)','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g08) dono troca tier (já pago)','bloqueado','bloqueado (42501)','PASS');
END $$;

-- g09) dono cancela (mesmo confirmada) → permitido
DO $$
DECLARE s text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET status='cancelada' WHERE id='de800000-0000-0000-0000-000000000001';
  SELECT status::text INTO s FROM registrations WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g09) dono cancela','cancelada',s, CASE WHEN s='cancelada' THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g09) dono cancela','cancelada','bloqueado','FAIL');
END $$;

-- g10) dono reinscreve (cancelada→reservada, fluxo B6) → permitido
DO $$
DECLARE s text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET status='reservada' WHERE id='de800000-0000-0000-0000-000000000001';
  SELECT status::text INTO s FROM registrations WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g10) dono reinscreve (cancelada→reservada)','reservada',s, CASE WHEN s='reservada' THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g10) dono reinscreve (cancelada→reservada)','reservada','bloqueado','FAIL');
END $$;

-- g11) dono tenta trocar ceremony_id (destino VAZIO — prova que é o guard,
-- não a capacidade) → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET ceremony_id='ce300000-0000-0000-0000-000000000003'
   WHERE id='de800000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g11) dono troca ceremony_id','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g11) dono troca ceremony_id','bloqueado','bloqueado (42501)','PASS');
END $$;

-- g12) staff da org faz check-in → permitido
DO $$
DECLARE s text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET status='check_in' WHERE id='de800000-0000-0000-0000-000000000002';
  SELECT status::text INTO s FROM registrations WHERE id='de800000-0000-0000-0000-000000000002';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g12) staff faz check-in','check_in',s, CASE WHEN s='check_in' THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('write guard','g12) staff faz check-in','check_in','bloqueado','FAIL');
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
