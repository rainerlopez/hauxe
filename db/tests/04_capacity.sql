-- =====================================================================
-- Suite 04 · Enforcement de vagas / capacidade (v09)
-- =====================================================================
-- Trigger BEFORE INSERT/UPDATE em registrations (check_ceremony_capacity):
--   ocupam vaga: reservada, pendente, aguardando_pagamento, confirmada, check_in
--   não ocupam: cancelada, lista_espera
-- Cobre: cheia → 'ceremony_full'; cancelamento libera; NULL ilimitado;
--        UPDATE não conta a si mesma (não auto-bloqueia).
-- Roda como papel privilegiado (o trigger atua em qualquer papel).
-- Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('d0000000-0000-0000-0000-000000000001','suite_p1@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000002','suite_p2@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000003','suite_p3@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000004','suite_p4@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000005','suite_p5@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a');

INSERT INTO ceremonies (id, org_id, title, status, starts_at, capacity) VALUES
  ('ce200000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','SUITE_Cer_Cap2','publicada', now() + interval '30 days', 2),
  ('ce000000-0000-0000-0000-00000000000e','a0000000-0000-0000-0000-000000000001','SUITE_Cer_Null','publicada', now() + interval '31 days', NULL);

-- d1a) duas inscrições ocupando vaga em cap=2 → passam
DO $$
BEGIN
  INSERT INTO registrations (ceremony_id, profile_id) VALUES
    ('ce200000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001'),
    ('ce200000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002');
  INSERT INTO _r VALUES('capacity','d1a) 2 inscrições em cap=2','passam','passam','PASS');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('capacity','d1a) 2 inscrições em cap=2','passam','erro: '||SQLERRM,'FAIL');
END $$;

-- d1b) terceira inscrição em cap=2 → 'ceremony_full'
DO $$
BEGIN
  INSERT INTO registrations (ceremony_id, profile_id) VALUES
    ('ce200000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');
  INSERT INTO _r VALUES('capacity','d1b) 3ª inscrição em cap=2','ceremony_full','sem erro','FAIL');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('capacity','d1b) 3ª inscrição em cap=2','ceremony_full',SQLERRM, CASE WHEN SQLERRM='ceremony_full' THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- d2) cancelar P1 libera vaga → P3 entra
DO $$
BEGIN
  UPDATE registrations SET status='cancelada'
   WHERE ceremony_id='ce200000-0000-0000-0000-000000000002' AND profile_id='d0000000-0000-0000-0000-000000000001';
  INSERT INTO registrations (ceremony_id, profile_id) VALUES
    ('ce200000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');
  INSERT INTO _r VALUES('capacity','d2) cancelamento libera vaga','P3 entra','P3 entra','PASS');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('capacity','d2) cancelamento libera vaga','P3 entra','erro: '||SQLERRM,'FAIL');
END $$;

-- d3) capacity NULL → 5 inscrições sem bloqueio
DO $$
DECLARE n int;
BEGIN
  INSERT INTO registrations (ceremony_id, profile_id) VALUES
    ('ce000000-0000-0000-0000-00000000000e','d0000000-0000-0000-0000-000000000001'),
    ('ce000000-0000-0000-0000-00000000000e','d0000000-0000-0000-0000-000000000002'),
    ('ce000000-0000-0000-0000-00000000000e','d0000000-0000-0000-0000-000000000003'),
    ('ce000000-0000-0000-0000-00000000000e','d0000000-0000-0000-0000-000000000004'),
    ('ce000000-0000-0000-0000-00000000000e','d0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO n FROM registrations WHERE ceremony_id='ce000000-0000-0000-0000-00000000000e';
  INSERT INTO _r VALUES('capacity','d3) capacity NULL = ilimitado','5','5 ('||n::text||')', CASE WHEN n=5 THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('capacity','d3) capacity NULL = ilimitado','5','erro: '||SQLERRM,'FAIL');
END $$;

-- d4) cap=2 cheia (P2+P3): re-salvar a própria reg de P2 NÃO auto-bloqueia
DO $$
BEGIN
  UPDATE registrations SET brings_food=true
   WHERE ceremony_id='ce200000-0000-0000-0000-000000000002' AND profile_id='d0000000-0000-0000-0000-000000000002';
  INSERT INTO _r VALUES('capacity','d4) UPDATE da própria reg (cheia) não auto-bloqueia','permitido','permitido','PASS');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('capacity','d4) UPDATE da própria reg (cheia) não auto-bloqueia','permitido','erro: '||SQLERRM,'FAIL');
END $$;

-- d5) REGRESSÃO C1/F2 (patch v11): trocar ceremony_id de uma inscrição
-- ocupante para uma cerimônia CHEIA deve ser BARRADO. P4 tem reserva na
-- cerimônia ilimitada; movê-la para 'ce200000' (cap=2, cheia com P2+P3)
-- mantendo status ocupante contornava a capacidade antes da v11.
-- Esperado pós-v11: 'ceremony_full'. Sem a v11 o UPDATE passa → FAIL.
DO $$
BEGIN
  UPDATE registrations SET ceremony_id='ce200000-0000-0000-0000-000000000002'
   WHERE ceremony_id='ce000000-0000-0000-0000-00000000000e' AND profile_id='d0000000-0000-0000-0000-000000000004';
  INSERT INTO _r VALUES('capacity','d5) troca de ceremony_id p/ cerimônia cheia é barrada','ceremony_full','sem erro (bypass!)','FAIL');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES('capacity','d5) troca de ceremony_id p/ cerimônia cheia é barrada','ceremony_full',SQLERRM, CASE WHEN SQLERRM='ceremony_full' THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
