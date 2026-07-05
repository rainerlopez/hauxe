-- =====================================================================
-- Suite 07 · Captura de CPF no cadastro (patch v12)
-- =====================================================================
-- Fluxo: o app envia raw_user_meta_data->>'cpf' no signUp; o trigger
-- handle_new_user() normaliza (11 dígitos) e grava em profiles.cpf.
-- Cobre: CPF formatado → normalizado; sem CPF → NULL; lixo → NULL (conta
-- criada mesmo assim); CHECK bloqueia escrita manual fora do formato.
-- Roda como papel privilegiado. Auto-contido + transacional (ROLLBACK).
-- =====================================================================
BEGIN;
SET LOCAL client_min_messages = WARNING;
CREATE TEMP TABLE _r(area text, caso text, esperado text, obtido text, resultado text) ON COMMIT DROP;

-- g1) CPF formatado nos metadados → gravado com 11 dígitos
DO $$
DECLARE v text;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, raw_user_meta_data) VALUES
    ('d0700000-0000-0000-0000-000000000001','suite_cpf1@hauxe-suite.invalid',
     '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     '{"full_name":"SUITE_Cpf_Um","cpf":"529.982.247-25"}'::jsonb);
  SELECT cpf INTO v FROM profiles WHERE id='d0700000-0000-0000-0000-000000000001';
  INSERT INTO _r VALUES('cpf','g1) CPF formatado → normalizado','52998224725',coalesce(v,'NULL'),
    CASE WHEN v='52998224725' THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- g2) sem CPF nos metadados → NULL (compatível com contas antigas)
DO $$
DECLARE v text;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, raw_user_meta_data) VALUES
    ('d0700000-0000-0000-0000-000000000002','suite_cpf2@hauxe-suite.invalid',
     '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     '{"full_name":"SUITE_Cpf_Dois"}'::jsonb);
  SELECT cpf INTO v FROM profiles WHERE id='d0700000-0000-0000-0000-000000000002';
  INSERT INTO _r VALUES('cpf','g2) sem CPF → NULL','NULL',coalesce(v,'NULL'),
    CASE WHEN v IS NULL THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- g3) lixo nos metadados → NULL, e a conta é criada mesmo assim
DO $$
DECLARE v text; n int;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, raw_user_meta_data) VALUES
    ('d0700000-0000-0000-0000-000000000003','suite_cpf3@hauxe-suite.invalid',
     '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     '{"full_name":"SUITE_Cpf_Tres","cpf":"abc-123"}'::jsonb);
  SELECT cpf INTO v FROM profiles WHERE id='d0700000-0000-0000-0000-000000000003';
  SELECT count(*) INTO n FROM profiles WHERE id='d0700000-0000-0000-0000-000000000003';
  INSERT INTO _r VALUES('cpf','g3) lixo → NULL (conta criada)','NULL + 1 profile',
    coalesce(v,'NULL') || ' + ' || n || ' profile',
    CASE WHEN v IS NULL AND n=1 THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- g4) CHECK bloqueia escrita manual fora do formato (11 dígitos)
DO $$
BEGIN
  BEGIN
    UPDATE profiles SET cpf='123' WHERE id='d0700000-0000-0000-0000-000000000001';
    INSERT INTO _r VALUES('cpf','g4) CHECK bloqueia cpf inválido','erro 23514','aceitou','FAIL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _r VALUES('cpf','g4) CHECK bloqueia cpf inválido','erro 23514','erro 23514','PASS');
  END;
END $$;

SELECT area, caso, esperado, obtido, resultado FROM _r ORDER BY caso;
ROLLBACK;
