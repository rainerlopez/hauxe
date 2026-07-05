-- =====================================================================
-- SONDAS EXTRAS (fora dos 28 casos) — verificam se os achados críticos
-- da revisão (weekend/REVIEW.md) se manifestam no banco fresh v01→v10.
-- Auto-contido + transacional (ROLLBACK). Convenção igual à das suítes.
-- "obtido = VULNERAVEL" significa que o bug do achado foi reproduzido.
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado_pos_fix text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('e0000000-0000-0000-0000-000000000001','probe_p1@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('e0000000-0000-0000-0000-000000000002','probe_p2@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('e0000000-0000-0000-0000-00000000000a','probe_admin@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('e0000000-0000-0000-0000-0000000000aa','PROBE_Org','probe-org');

INSERT INTO org_members (org_id, profile_id, role) VALUES
  ('e0000000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-00000000000a','org_admin');

INSERT INTO ceremonies (id, org_id, title, status, starts_at, capacity) VALUES
  ('ec100000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000aa','PROBE_Cheia','publicada', now() + interval '30 days', 1),
  ('ec200000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-0000000000aa','PROBE_Outra','publicada', now() + interval '31 days', 10);

-- Lota a cerimônia cap=1 com p1; p2 fica inscrito na outra cerimônia.
INSERT INTO registrations (id, ceremony_id, profile_id) VALUES
  ('ee100000-0000-0000-0000-000000000001','ec100000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001'),
  ('ee200000-0000-0000-0000-000000000002','ec200000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------
-- P1 (C1): participante muda ceremony_id da própria inscrição para uma
-- cerimônia CHEIA → trigger deveria barrar (ceremony_full), mas o
-- early-return de UPDATE só olha OLD.status.
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET ceremony_id = 'ec100000-0000-0000-0000-000000000001'
   WHERE id = 'ee200000-0000-0000-0000-000000000002';
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM registrations
   WHERE ceremony_id = 'ec100000-0000-0000-0000-000000000001'
     AND status IN ('reservada','pendente','aguardando_pagamento','confirmada','check_in');
  INSERT INTO _r VALUES('C1 capacity bypass','p1) UPDATE ceremony_id → cerimônia cheia',
    'bloqueado (ceremony_full)', n || ' ocupantes em cap=1 — UPDATE passou', 'VULNERAVEL');
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('C1 capacity bypass','p1) UPDATE ceremony_id → cerimônia cheia',
    'bloqueado (ceremony_full)', 'bloqueado: '||SQLERRM, 'PROTEGIDO');
END $$;

-- ---------------------------------------------------------------------
-- P2 (C2): participante se auto-promove a 'confirmada' sem ficha nem
-- pagamento, via policy owner FOR ALL sem restrição de coluna.
-- ---------------------------------------------------------------------
DO $$
DECLARE s registration_status;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE registrations SET status = 'confirmada'
   WHERE id = 'ee100000-0000-0000-0000-000000000001';
  EXECUTE 'RESET ROLE';
  SELECT status INTO s FROM registrations WHERE id = 'ee100000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('C2 self-confirm','p2) owner UPDATE status=confirmada',
    'bloqueado (coluna restrita)', 'status virou '||s||' sem ficha/pagamento', 'VULNERAVEL');
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('C2 self-confirm','p2) owner UPDATE status=confirmada',
    'bloqueado (coluna restrita)', 'bloqueado: '||SQLERRM, 'PROTEGIDO');
END $$;

-- ---------------------------------------------------------------------
-- P3 (A1): policy "anamnese-files staff read" (v03, cast ::uuid) segue
-- ativa no banco fresh. Um objeto com pasta não-UUID no bucket faz o
-- SELECT da staff explodir com 22P02 (o v08 sozinho não explodiria).
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('anamnese-files','anamnese-files', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('anamnese-files','pasta-nao-uuid/ficha.pdf','e0000000-0000-0000-0000-000000000001');

DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'anamnese-files';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('A1 policy v03 residual','p3) staff SELECT em anamnese-files com pasta não-UUID',
    'consulta ok (0 linhas visíveis)', 'consulta ok ('||n||' linhas)', 'PROTEGIDO');
EXCEPTION WHEN invalid_text_representation THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('A1 policy v03 residual','p3) staff SELECT em anamnese-files com pasta não-UUID',
    'consulta ok (0 linhas visíveis)', 'ERRO 22P02 (cast ::uuid da policy v03)', 'VULNERAVEL');
WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('A1 policy v03 residual','p3) staff SELECT em anamnese-files com pasta não-UUID',
    'consulta ok (0 linhas visíveis)', 'erro inesperado: '||SQLERRM, 'VULNERAVEL');
END $$;

SELECT * FROM _r;
ROLLBACK;
