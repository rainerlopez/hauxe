-- =====================================================================
-- TEARDOWN dos dados de teste — Hauxe
-- =====================================================================
-- Remove EXATAMENTE o que o seed_test_data.sql criou e NADA além disso.
-- Escopo estrito: UUIDs fixos 5eed… e e-mails @hauxe-seed.invalid.
-- Idempotente: seguro rodar mesmo sem seed aplicado.
-- Ordem respeita FKs (filhos → pais); apaga explicitamente para não
-- depender de ON DELETE CASCADE.
--
-- NOTA: storage.objects tem o trigger storage.protect_delete(), que bloqueia
-- DELETE direto a menos que a GUC storage.allow_delete_query='true' esteja
-- setada (escape hatch oficial da plataforma). Por isso o script roda dentro
-- de uma transação que seta essa GUC localmente.
-- =====================================================================
BEGIN;
SET LOCAL storage.allow_delete_query = 'true';

-- 1. storage objects (ficha + imagem) — escopados pelo prefixo 5eed
DELETE FROM storage.objects
 WHERE bucket_id IN ('anamnese-files','ceremony-images')
   AND name LIKE '5eed%';

-- 2. payments das inscrições de teste
DELETE FROM payments
 WHERE registration_id IN (
   SELECT id FROM registrations
    WHERE ceremony_id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0','5eedce00-0000-0000-0000-0000000000c1')
 );

-- 3. registrations das cerimônias de teste
DELETE FROM registrations
 WHERE ceremony_id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0','5eedce00-0000-0000-0000-0000000000c1');

-- 4. vínculos cerimônia↔condutor de teste
DELETE FROM ceremony_conductors
 WHERE ceremony_id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0','5eedce00-0000-0000-0000-0000000000c1');

-- 5. tiers de contribuição de teste
DELETE FROM contribution_tiers
 WHERE ceremony_id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0','5eedce00-0000-0000-0000-0000000000c1');

-- 6. anamneses dos participantes de teste
DELETE FROM anamneses
 WHERE profile_id IN (
   '5eed0000-0000-0000-0000-000000000001',
   '5eed0000-0000-0000-0000-000000000002',
   '5eed0000-0000-0000-0000-000000000003'
 );

-- 7. cerimônias de teste
DELETE FROM ceremonies
 WHERE id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0','5eedce00-0000-0000-0000-0000000000c1');

-- 8. condutores de teste
DELETE FROM conductors
 WHERE id IN ('5eedc000-0000-0000-0000-00000000a001','5eedc000-0000-0000-0000-00000000a002');

-- 9. usuários de teste (cascade → profiles e qualquer resíduo)
DELETE FROM auth.users
 WHERE email LIKE '%@hauxe-seed.invalid';

-- ---------- verificação: deve dar tudo 0 ----------
SELECT 'teardown concluído' AS status,
  (SELECT count(*) FROM profiles WHERE email LIKE '%@hauxe-seed.invalid') AS participantes,
  (SELECT count(*) FROM conductors WHERE name LIKE 'TEST\_%') AS condutores,
  (SELECT count(*) FROM ceremonies WHERE title LIKE 'TEST\_%') AS cerimonias,
  (SELECT count(*) FROM registrations WHERE ceremony_id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0','5eedce00-0000-0000-0000-0000000000c1')) AS inscricoes,
  (SELECT count(*) FROM storage.objects WHERE name LIKE '5eed%') AS arquivos;
COMMIT;
