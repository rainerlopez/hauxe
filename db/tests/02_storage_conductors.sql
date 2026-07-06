-- =====================================================================
-- Suite 02 · Storage de avatares de condutores (v07 → v13)
-- =====================================================================
-- Bucket: ceremony-images (público). Convenção de path do avatar:
--   conductors/{org_id}/{arquivo}
-- v13 (D5/M6): escrita só org_admin (alinha com a tabela conductors).
-- v13 (D7/A5): bucket público NÃO é mais listável (advisor 0025) — a URL
--   pública continua servindo objetos (não passa por RLS); staff da org
--   lista os seus.
-- Cobre: INSERT bloqueado p/ membro comum; permitido p/ org_admin;
--        bloqueado p/ org errada; listagem só para staff.
-- Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('a1110000-0000-0000-0000-000000000001','suite_admin_a@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a2220000-0000-0000-0000-000000000002','suite_member_a@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000ff','suite_none@hauxe-suite.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001','SUITE_Org_A','suite-org-a'),
  ('b0000000-0000-0000-0000-000000000002','SUITE_Org_B','suite-org-b');

INSERT INTO org_members (org_id, profile_id, role) VALUES
  ('a0000000-0000-0000-0000-000000000001','a1110000-0000-0000-0000-000000000001','org_admin'),
  ('a0000000-0000-0000-0000-000000000001','a2220000-0000-0000-0000-000000000002','conductor');

-- b1) membro comum (role conductor) tenta upload no path da própria org
--     → bloqueado (v13/D5: escrita é só org_admin)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a2220000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('ceremony-images','conductors/a0000000-0000-0000-0000-000000000001/avatar.jpg','a2220000-0000-0000-0000-000000000002');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b1) membro comum faz upload','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b1) membro comum faz upload','bloqueado','bloqueado (42501)','PASS');
END $$;

-- b1b) org_admin da org A faz upload no path da própria org → permitido
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('ceremony-images','conductors/a0000000-0000-0000-0000-000000000001/avatar.jpg','a1110000-0000-0000-0000-000000000001');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b1b) org_admin faz upload na própria org','permitido','permitido','PASS');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b1b) org_admin faz upload na própria org','permitido','bloqueado','FAIL');
END $$;

-- b2) org_admin da org A tenta upload no path de OUTRA org (B) → bloqueado
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('ceremony-images','conductors/b0000000-0000-0000-0000-000000000002/avatar.jpg','a1110000-0000-0000-0000-000000000001');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b2) upload no path de outra org','bloqueado','permitido','FAIL');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b2) upload no path de outra org','bloqueado','bloqueado (42501)','PASS');
END $$;

-- objeto-semente (papel privilegiado) p/ teste de leitura pública
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('ceremony-images','conductors/a0000000-0000-0000-0000-000000000001/publico.jpg','a2220000-0000-0000-0000-000000000002');

-- b3) v13/D7: usuário SEM org NÃO lista objetos do bucket (URL pública
--     continua servindo o download — não passa por RLS)
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='ceremony-images' AND name='conductors/a0000000-0000-0000-0000-000000000001/publico.jpg';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b3) sem-org NÃO lista o bucket','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- b4) v13/D7: anon também NÃO lista
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='ceremony-images' AND name='conductors/a0000000-0000-0000-0000-000000000001/publico.jpg';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b4) anon NÃO lista o bucket','0',n::text, CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- b5) staff da org (qualquer papel) LISTA os arquivos da própria org
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a2220000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='ceremony-images' AND name='conductors/a0000000-0000-0000-0000-000000000001/publico.jpg';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES('storage conductors','b5) staff da org lista os seus','1',n::text, CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
