-- =====================================================================
-- Suite 03 · Storage anamnese-files — staff-read por org (v08)
-- =====================================================================
-- Bucket privado anamnese-files. Convenção de path: {profile_id}/{arquivo}.
-- Policies: dono (lê/upload/deleta via foldername[1]=auth.uid());
--           "staff lê" (registrations→ceremonies→is_org_member(org)).
-- Cobre: staff da org lê ficha de inscrito; sem-org não lê; dono intacto;
--        outro participante (não dono/não staff) não lê.
-- Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('a1110000-0000-0000-0000-000000000001','suite_admin_a@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000ff','suite_none@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000001','suite_p1@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000002','suite_p2@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a');

INSERT INTO org_members (org_id, profile_id, role) VALUES
  ('a0000000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000001','org_admin');

INSERT INTO ceremonies (id, org_id, title, status, starts_at) VALUES
  ('ce100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','SUITE_Cer_A','publicada', now() + interval '20 days');

-- P1 inscrito numa cerimônia de A → staff de A pode ler a ficha de P1
INSERT INTO registrations (ceremony_id, profile_id, status) VALUES
  ('ce100000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','reservada');

-- objeto-semente: ficha de P1 (papel privilegiado)
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('anamnese-files','d0000000-0000-0000-0000-000000000001/intake.pdf','d0000000-0000-0000-0000-000000000001');

-- c1) org_admin da org A LÊ a ficha do inscrito (staff-read)
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='anamnese-files' AND name='d0000000-0000-0000-0000-000000000001/intake.pdf';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c1) org_admin lê ficha de inscrito da org','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- c2) usuário autenticado SEM org NÃO lê
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='anamnese-files' AND name='d0000000-0000-0000-0000-000000000001/intake.pdf';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c2) sem-org NÃO lê ficha','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- c3) DONO (P1) lê o próprio arquivo (policy do participante intacta)
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='anamnese-files' AND name='d0000000-0000-0000-0000-000000000001/intake.pdf';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c3) dono lê o próprio arquivo','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- c4) DONO (P1) faz upload do próprio arquivo (policy de upload intacta)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('anamnese-files','d0000000-0000-0000-0000-000000000001/novo.pdf','d0000000-0000-0000-0000-000000000001');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c4) dono faz upload do próprio arquivo','permitido','permitido','PASS');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c4) dono faz upload do próprio arquivo','permitido','bloqueado','FAIL');
END $$;

-- c5) outro participante (P2, não dono / não staff) NÃO lê a ficha de P1
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='anamnese-files' AND name='d0000000-0000-0000-0000-000000000001/intake.pdf';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c5) outro participante NÃO lê ficha alheia','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- c6) v13/D4 (LGPD): inscrição CANCELADA → staff perde o acesso à ficha
DO $$
DECLARE n int;
BEGIN
  UPDATE registrations SET status='cancelada'
   WHERE ceremony_id='ce100000-0000-0000-0000-000000000001'
     AND profile_id='d0000000-0000-0000-0000-000000000001';
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='anamnese-files' AND name='d0000000-0000-0000-0000-000000000001/intake.pdf';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('anamnese staff-read','c6) inscrição cancelada → staff NÃO lê','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
