-- =====================================================================
-- Suite 05 · ceremony_conductors — mesma-org + RESTRICT (v09 / v09b)
-- =====================================================================
-- Trigger enforce_ceremony_conductor_same_org (BEFORE INSERT/UPDATE):
--   org do conductor deve = org da ceremony, senão 'conductor_org_mismatch'.
-- FK conductor_id ON DELETE RESTRICT: não dá pra apagar conductor vinculado.
-- Cobre: same-org passa; cross-org falha (INSERT e UPDATE); RESTRICT no DELETE.
-- Roda como papel privilegiado. Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a'),
  ('b0000000-0000-0000-0000-000000000002','SUITE_Org_B','suite-org-b');

INSERT INTO conductors (id, org_id, name) VALUES
  ('ca100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','SUITE_Cond_A1'),
  ('cb100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','SUITE_Cond_B1');

INSERT INTO ceremonies (id, org_id, title, status, starts_at) VALUES
  ('ce100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','SUITE_Cer_A','publicada', now() + interval '15 days');

-- e1) vincular condutor da MESMA org → passa
DO $$
BEGIN
  INSERT INTO ceremony_conductors (ceremony_id, conductor_id)
  VALUES ('ce100000-0000-0000-0000-000000000001','ca100000-0000-0000-0000-000000000001');
  INSERT INTO _r VALUES('ceremony_conductors','e1) vínculo mesma org (INSERT)','passa','passa','PASS');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('ceremony_conductors','e1) vínculo mesma org (INSERT)','passa','erro: '||SQLERRM,'FAIL');
END $$;

-- e2) vincular condutor de OUTRA org → conductor_org_mismatch (INSERT)
DO $$
BEGIN
  INSERT INTO ceremony_conductors (ceremony_id, conductor_id)
  VALUES ('ce100000-0000-0000-0000-000000000001','cb100000-0000-0000-0000-000000000001');
  INSERT INTO _r VALUES('ceremony_conductors','e2) vínculo cross-org (INSERT)','conductor_org_mismatch','sem erro','FAIL');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('ceremony_conductors','e2) vínculo cross-org (INSERT)','conductor_org_mismatch',SQLERRM, CASE WHEN SQLERRM='conductor_org_mismatch' THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- e3) UPDATE trocando conductor_id p/ outra org → conductor_org_mismatch
DO $$
BEGIN
  UPDATE ceremony_conductors SET conductor_id='cb100000-0000-0000-0000-000000000001'
   WHERE ceremony_id='ce100000-0000-0000-0000-000000000001' AND conductor_id='ca100000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('ceremony_conductors','e3) vínculo cross-org (UPDATE)','conductor_org_mismatch','sem erro','FAIL');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('ceremony_conductors','e3) vínculo cross-org (UPDATE)','conductor_org_mismatch',SQLERRM, CASE WHEN SQLERRM='conductor_org_mismatch' THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- e4) DELETE de conductor vinculado → bloqueado pelo RESTRICT (FK 23503)
DO $$
BEGIN
  DELETE FROM conductors WHERE id='ca100000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('ceremony_conductors','e4) DELETE de conductor vinculado','bloqueado (RESTRICT)','sem erro','FAIL');
EXCEPTION WHEN foreign_key_violation THEN
  INSERT INTO _r VALUES('ceremony_conductors','e4) DELETE de conductor vinculado','bloqueado (RESTRICT)','bloqueado (23503)','PASS');
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
