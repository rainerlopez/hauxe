-- =====================================================================
-- SEED de dados de teste (rodada manual) — Hauxe
-- =====================================================================
-- Cria um cenário PERSISTENTE dentro da org real "Oca Guata Heté"
-- (id 47e2c530-bb71-4632-91ff-a7822127b516), todo marcado com prefixo
-- TEST_ / UUIDs iniciando em 5eed…, para o org_admin (rainerdev) explorar
-- no console. Remova depois com teardown_test_data.sql.
--
-- Idempotente: ON CONFLICT DO NOTHING / guards. Pode rodar mais de uma vez.
-- NÃO toca em dados reais — tudo escopado aos IDs/prefixos abaixo.
--
-- Cenário:
--   • 3 participantes TEST_ (auth.users → profiles via trigger)
--   • 2 condutores: TEST_Condutor_Ativo (active), TEST_Condutor_Inativo
--   • 2 cerimônias: TEST_Cerimonia_Cap2 (capacity=2, CHEIA), TEST_Cerimonia_SemLimite (NULL)
--   • 1 tier de contribuição
--   • 1 vínculo cerimônia↔condutor (mesma org)
--   • registrations em status variados (reservada/confirmada/cancelada)
--   • 1 anamnese (consent=true) + 1 arquivo de ficha + 1 imagem de cerimônia
-- =====================================================================

-- ---------- participantes ----------
INSERT INTO auth.users (id, email, instance_id, aud, role, raw_user_meta_data) VALUES
  ('5eed0000-0000-0000-0000-000000000001','test_p1@hauxe-seed.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated','{"full_name":"TEST_Participante_1"}'),
  ('5eed0000-0000-0000-0000-000000000002','test_p2@hauxe-seed.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated','{"full_name":"TEST_Participante_2"}'),
  ('5eed0000-0000-0000-0000-000000000003','test_p3@hauxe-seed.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated','{"full_name":"TEST_Participante_3"}')
ON CONFLICT (id) DO NOTHING;

-- ---------- condutores (1 ativo, 1 inativo) ----------
INSERT INTO conductors (id, org_id, name, bio, active) VALUES
  ('5eedc000-0000-0000-0000-00000000a001','47e2c530-bb71-4632-91ff-a7822127b516','TEST_Condutor_Ativo','Condutor de teste (ativo).', true),
  ('5eedc000-0000-0000-0000-00000000a002','47e2c530-bb71-4632-91ff-a7822127b516','TEST_Condutor_Inativo','Condutor de teste (inativo).', false)
ON CONFLICT (id) DO NOTHING;

-- ---------- cerimônias (cap=2 e ilimitada) ----------
INSERT INTO ceremonies (id, org_id, title, description, orientations, status, starts_at, capacity) VALUES
  ('5eedce00-0000-0000-0000-0000000000c2','47e2c530-bb71-4632-91ff-a7822127b516','TEST_Cerimonia_Cap2','Cerimônia de teste com capacidade 2.','Chegar 30min antes. Jejum de 4h.','publicada', now() + interval '30 days', 2),
  ('5eedce00-0000-0000-0000-0000000000e0','47e2c530-bb71-4632-91ff-a7822127b516','TEST_Cerimonia_SemLimite','Cerimônia de teste sem limite de vagas.','Trazer agasalho.','publicada', now() + interval '31 days', NULL),
  -- capacity=1, SEM inscrições — reservada para o teste manual de concorrência
  ('5eedce00-0000-0000-0000-0000000000c1','47e2c530-bb71-4632-91ff-a7822127b516','TEST_Cerimonia_Cap1','Cerimônia de teste capacidade 1 (corrida de vaga).','—','publicada', now() + interval '32 days', 1)
ON CONFLICT (id) DO NOTHING;

-- ---------- tier de contribuição ----------
INSERT INTO contribution_tiers (id, ceremony_id, label, amount, sort_order) VALUES
  ('5eed7100-0000-0000-0000-000000000001','5eedce00-0000-0000-0000-0000000000c2','TEST_Contribuição', 100, 0)
ON CONFLICT (id) DO NOTHING;

-- ---------- vínculo cerimônia ↔ condutor (mesma org) ----------
INSERT INTO ceremony_conductors (ceremony_id, conductor_id) VALUES
  ('5eedce00-0000-0000-0000-0000000000c2','5eedc000-0000-0000-0000-00000000a001')
ON CONFLICT (ceremony_id, conductor_id) DO NOTHING;

-- ---------- registrations em status variados ----------
-- Cap2 fica CHEIA (2/2): P1 reservada + P2 confirmada
INSERT INTO registrations (id, ceremony_id, profile_id, status) VALUES
  ('5eed4e60-0000-0000-0000-0000000000c1','5eedce00-0000-0000-0000-0000000000c2','5eed0000-0000-0000-0000-000000000001','reservada'),
  ('5eed4e60-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000c2','5eed0000-0000-0000-0000-000000000002','confirmada')
ON CONFLICT (ceremony_id, profile_id) DO NOTHING;

-- SemLimite: P1 confirmada, P2 reservada, P3 cancelada
INSERT INTO registrations (id, ceremony_id, profile_id, status) VALUES
  ('5eed4e60-0000-0000-0000-0000000000e1','5eedce00-0000-0000-0000-0000000000e0','5eed0000-0000-0000-0000-000000000001','confirmada'),
  ('5eed4e60-0000-0000-0000-0000000000e2','5eedce00-0000-0000-0000-0000000000e0','5eed0000-0000-0000-0000-000000000002','reservada'),
  ('5eed4e60-0000-0000-0000-0000000000e3','5eedce00-0000-0000-0000-0000000000e0','5eed0000-0000-0000-0000-000000000003','cancelada')
ON CONFLICT (ceremony_id, profile_id) DO NOTHING;

-- ---------- anamnese (consent) + arquivo de ficha ----------
INSERT INTO anamneses (profile_id, emergency_contact_name, emergency_contact_phone, consent_health_data, consent_at) VALUES
  ('5eed0000-0000-0000-0000-000000000001','TEST_Contato_Emergencia','+5511999990001', true, now())
ON CONFLICT (profile_id) DO NOTHING;

-- arquivo de ficha (path: {profile_id}/intake.pdf) e imagem de cerimônia
-- (path: {ceremony_id}/cartaz.jpg) — ambos escopados pelo prefixo 5eed
INSERT INTO storage.objects (bucket_id, name, owner)
SELECT 'anamnese-files','5eed0000-0000-0000-0000-000000000001/intake.pdf','5eed0000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='anamnese-files' AND name='5eed0000-0000-0000-0000-000000000001/intake.pdf');

INSERT INTO storage.objects (bucket_id, name, owner)
SELECT 'ceremony-images','5eedce00-0000-0000-0000-0000000000c2/cartaz.jpg','5eed0000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='ceremony-images' AND name='5eedce00-0000-0000-0000-0000000000c2/cartaz.jpg');

-- ---------- resumo ----------
SELECT 'seed aplicado' AS status,
  (SELECT count(*) FROM profiles WHERE email LIKE '%@hauxe-seed.invalid') AS participantes,
  (SELECT count(*) FROM conductors WHERE name LIKE 'TEST\_%') AS condutores,
  (SELECT count(*) FROM ceremonies WHERE title LIKE 'TEST\_%') AS cerimonias,
  (SELECT count(*) FROM registrations WHERE ceremony_id IN ('5eedce00-0000-0000-0000-0000000000c2','5eedce00-0000-0000-0000-0000000000e0')) AS inscricoes,
  (SELECT count(*) FROM storage.objects WHERE name LIKE '5eed%') AS arquivos;
