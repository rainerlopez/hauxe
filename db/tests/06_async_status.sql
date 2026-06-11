-- =====================================================================
-- Suite 06 · Promoção assíncrona de status (MVP)
-- =====================================================================
-- Fluxo: registration nasce 'reservada'. Gatilhos em anamneses/payments
-- chamam refresh_registration_status(), que promove a 'confirmada' quando
-- ficha_ok (anamnese c/ consent_health_data=true) E pagamento_ok (payment
-- status='pago') — conforme a view registration_progress.
-- Cobre: só ficha → continua reservada; ficha + pagamento → confirmada.
-- Roda como papel privilegiado. Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('d0000000-0000-0000-0000-000000000001','suite_p1@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a');

INSERT INTO ceremonies (id, org_id, title, status, starts_at, capacity) VALUES
  ('ce000000-0000-0000-0000-00000000000e','a0000000-0000-0000-0000-000000000001','SUITE_Cer_Null','publicada', now() + interval '30 days', NULL);

-- baseline: registration nasce 'reservada'
INSERT INTO registrations (id, ceremony_id, profile_id) VALUES
  ('de100000-0000-0000-0000-000000000001','ce000000-0000-0000-0000-00000000000e','d0000000-0000-0000-0000-000000000001');

-- f0) baseline = reservada
DO $$
DECLARE s text;
BEGIN
  SELECT status::text INTO s FROM registrations WHERE id='de100000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('async status','f0) baseline (default)','reservada',s, CASE WHEN s='reservada' THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- f1) só ficha (anamnese c/ consent) e SEM pagamento → continua reservada
DO $$
DECLARE s text;
BEGIN
  INSERT INTO anamneses (profile_id, consent_health_data, consent_at)
  VALUES ('d0000000-0000-0000-0000-000000000001', true, now());
  SELECT status::text INTO s FROM registrations WHERE id='de100000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('async status','f1) só ficha (sem pagamento) → reservada','reservada',s, CASE WHEN s='reservada' THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- f2) ficha + pagamento 'pago' → promovida a confirmada
DO $$
DECLARE s text;
BEGIN
  INSERT INTO payments (registration_id, amount, status)
  VALUES ('de100000-0000-0000-0000-000000000001', 100, 'pago');
  SELECT status::text INTO s FROM registrations WHERE id='de100000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('async status','f2) ficha + pagamento → confirmada','confirmada',s, CASE WHEN s='confirmada' THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
