-- =====================================================================
-- HAUXE — Patch v11 · Correções de segurança (auditoria de fim de semana)
-- =====================================================================
-- Origem: revisão profunda + suíte de testes em Postgres local
-- (weekend/REVIEW.md, weekend/TEST-RESULTS.md). Dois defeitos confirmados
-- de forma reproduzível num banco criado do zero a partir do repo:
--
--   F1 (achado A1) · Policies órfãs da v03 sobrevivem à cadeia de migrations.
--     A v03 criou as policies de storage com nomes SEM hífen
--     ("ceremony-images staff write/update/delete", "anamnese-files staff
--     read"), todas com o cast inseguro (storage.foldername(name))[1]::uuid.
--     As migrations v05/v07/v08 corrigiram apenas os nomes COM hífen (os que
--     existiam na produção, criados ad-hoc). Num banco novo, os nomes da v03
--     continuam ativos e o cast lança 22P02 ("invalid input syntax for type
--     uuid: 'conductors'") ao avaliar um upload de avatar (path
--     conductors/{org_id}/...), bloqueando o bucket — o mesmo incidente que a
--     v07 descreve. O erro só se materializa quando o cast é efetivamente
--     avaliado (tabela alvo não-vazia ou constant-folding do planner); em
--     produção, que sempre tem cerimônias/inscrições, o bloqueio é
--     determinístico. Correção: dropar os nomes órfãos da v03. As versões
--     seguras (com hífen, comparação texto/texto) já existem e permanecem.
--
--   F2 (achado C1) · Trigger de capacidade contornável ao trocar ceremony_id.
--     O early-return do UPDATE em check_ceremony_capacity() olhava apenas
--     OLD.status. Um UPDATE que MUDA ceremony_id mantendo status ocupante
--     (ex.: reservada) libera a vaga antiga e ocupa uma vaga na cerimônia
--     nova SEM checagem nem lock — a premissa "já ocupava" só vale para a
--     MESMA cerimônia. Via policy owner (FOR ALL), um participante consegue
--     mover a própria inscrição para uma cerimônia LOTADA. Correção: o
--     early-return passa a exigir OLD.ceremony_id = NEW.ceremony_id; qualquer
--     troca de cerimônia volta a travar e contar a cerimônia NOVA.
--
-- Idempotente e seguro em produção: os DROPs usam IF EXISTS (nomes órfãos não
-- existem em produção) e a função é reescrita com CREATE OR REPLACE.
--
-- FORA DE ESCOPO (dependem de decisão de produto — ver weekend/MONDAY-BRIEF.md):
--   C2 (dono se auto-promove a 'confirmada'/'check_in' via policy owner),
--   M1/M6 (escopo LGPD e intenção da policy de avatar), A3 (validação
--   server-side de chosen_contribution na integração PIX).
-- =====================================================================

-- ---------------------------------------------------------------------
-- F1 · Remover as policies órfãs da v03 (cast ::uuid inseguro)
-- ---------------------------------------------------------------------
-- ceremony-images: substituídas pelas versões "…- staff faz upload/atualiza/
-- deleta" (v07, comparação c.id::text = foldername()[1]).
DROP POLICY IF EXISTS "ceremony-images staff write"  ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images staff update" ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images staff delete" ON storage.objects;

-- anamnese-files: substituída por "anamnese-files - staff lê" (v08,
-- comparação r.profile_id::text = foldername()[1]).
DROP POLICY IF EXISTS "anamnese-files staff read"    ON storage.objects;

-- ---------------------------------------------------------------------
-- F2 · Fechar o bypass de capacidade na troca de ceremony_id
-- ---------------------------------------------------------------------
-- Reescreve check_ceremony_capacity() mantendo tudo igual à v09, exceto o
-- early-return do UPDATE, que agora exige mesma cerimônia.
CREATE OR REPLACE FUNCTION public.check_ceremony_capacity()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_capacity integer;
  v_count    integer;
  v_occupying public.registration_status[] := ARRAY[
    'reservada','pendente','aguardando_pagamento','confirmada','check_in'
  ]::public.registration_status[];
BEGIN
  -- Só enforce quando a linha ENTRA em ocupação de vaga.
  IF NOT (NEW.status = ANY (v_occupying)) THEN
    RETURN NEW;  -- status sem ocupação (cancelada/lista_espera): libera
  END IF;

  -- Já ocupava vaga NA MESMA cerimônia (ex.: reservada->confirmada): sem nova
  -- vaga. A checagem de ceremony_id fecha o bypass do C1: um UPDATE que troca
  -- de cerimônia com status ocupante NÃO faz early-return — cai na trava +
  -- contagem da cerimônia NOVA.
  IF TG_OP = 'UPDATE'
     AND (OLD.status = ANY (v_occupying))
     AND OLD.ceremony_id = NEW.ceremony_id THEN
    RETURN NEW;
  END IF;

  -- Trava a cerimônia: serializa inscrições concorrentes na mesma cerimônia.
  SELECT capacity INTO v_capacity
    FROM public.ceremonies
   WHERE id = NEW.ceremony_id
   FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN NEW;  -- sem limite
  END IF;

  SELECT count(*) INTO v_count
    FROM public.registrations
   WHERE ceremony_id = NEW.ceremony_id
     AND id <> NEW.id
     AND status = ANY (v_occupying);

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'ceremony_full'
      USING HINT = 'A cerimônia atingiu a capacidade máxima.';
  END IF;

  RETURN NEW;
END;
$$;

-- Mantém o hardening da v09 (função só-de-trigger; sem exposição via /rpc).
REVOKE EXECUTE ON FUNCTION public.check_ceremony_capacity() FROM PUBLIC, anon, authenticated;

-- O trigger trg_ceremony_capacity (v09) já aponta para esta função; o
-- CREATE OR REPLACE acima basta, não é preciso recriar o trigger.
