-- =====================================================================
-- Hauxe · Patch v13 — Endurecimento de segurança pós-auditoria
-- =====================================================================
-- Fecha os achados abertos da auditoria de fim de semana (weekend/REVIEW.md)
-- conforme as decisões D1–D9 registradas em PROGRESSO.md (06/07/2026):
--
--   F1 (C2/D1/D2)  Guard de escrita em registrations: o dono só cancela,
--                  reinscreve (cancelada→reservada), edita brings_food/notes
--                  e troca tier enquanto não pago. ceremony_id é imutável
--                  para qualquer ator com JWT (trocar = cancelar+reinscrever).
--   F2 (D8)        DROP de simulate_payment() — mock que permitia ao
--                  participante marcar a própria inscrição como paga.
--                  (Definida direto em produção, migration 20260603132919;
--                  nunca esteve na cadeia do repo — DROP IF EXISTS cobre os
--                  dois mundos.)
--   F3 (M3/D9)     on_anamnese_change alinhada com refresh_registration_status
--                  (inclui 'pendente'/'aguardando_pagamento').
--   F4 (M1/D4)     Staff-read de anamnese (tabela + storage) limitado a
--                  inscrições com status <> 'cancelada' (minimização LGPD).
--   F5 (M6/D5)     Avatares de condutor: escrita só org_admin (alinha com a
--                  tabela conductors, v06). De quebra elimina o cast ::uuid
--                  (comparação texto-a-texto, padrão v07b/v08).
--   F6 (A5/D7)     Bucket público ceremony-images deixa de ser LISTÁVEL por
--                  qualquer um (advisor 0025). URL pública continua servindo
--                  os objetos (não passa por RLS); staff da org lista os seus.
--   F7 (M2/D6)     RPC log_anamnese_view() — trilha LGPD em audit_log toda
--                  vez que a staff abre uma ficha de saúde no console.
--   F8 (M7/D3)     Colunas da v10 (ceremonies.contribution_tiers jsonb e
--                  registrations.chosen_contribution) marcadas DEPRECATED via
--                  COMMENT — fonte única é a tabela contribution_tiers.
--                  Remoção física fica para revisão explícita.
--
-- Idempotente. Testes: db/tests/08_registration_write_guard.sql (novos) +
-- ajustes em 02 (b1/b3/b4) e 03 (c6).
-- =====================================================================

-- ---------------------------------------------------------------------
-- F1 · Guard de escrita do dono em registrations (C2)
-- ---------------------------------------------------------------------
-- BEFORE INSERT OR UPDATE. Camadas de ator, da mais confiável à menos:
--   1. pg_trigger_depth() > 1  → escrita vinda dos nossos próprios triggers
--      (on_payment_change / on_anamnese_change → refresh_registration_status);
--      confiável por construção. (Chamada direta via API fica em depth 1.)
--   2. auth.uid() IS NULL      → service_role / postgres / scripts — livres.
--   3. ceremony_id imutável para QUALQUER ator com JWT (D2).
--   4. staff da org (ou super admin) → sem mais restrições.
--   5. dono → só o subconjunto permitido (D1).
CREATE OR REPLACE FUNCTION public.enforce_registration_write_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_is_staff boolean;
  v_immutable_old jsonb;
  v_immutable_new jsonb;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;   -- sync interno (payment/anamnese → status)
  END IF;

  IF v_actor IS NULL THEN
    RETURN NEW;   -- service_role / postgres
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.ceremony_id IS DISTINCT FROM OLD.ceremony_id THEN
    RAISE EXCEPTION 'Não é permitido trocar a cerimônia de uma inscrição. Cancele e inscreva-se novamente.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ceremonies c
    WHERE c.id = NEW.ceremony_id AND public.is_org_member(c.org_id)
  ) OR public.is_super_admin()
  INTO v_is_staff;

  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  -- ── Dono (participante) ──
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'reservada' THEN
      RAISE EXCEPTION 'Inscrição nasce como reserva — a confirmação é automática.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: fora do subconjunto permitido, nada pode mudar.
  v_immutable_old := to_jsonb(OLD) - ARRAY['status','brings_food','notes','tier_id','updated_at'];
  v_immutable_new := to_jsonb(NEW) - ARRAY['status','brings_food','notes','tier_id','updated_at'];
  IF v_immutable_old <> v_immutable_new THEN
    RAISE EXCEPTION 'Alteração não permitida na inscrição.'
      USING ERRCODE = '42501';
  END IF;

  -- status: só cancelar, ou reinscrever (cancelada → reservada; vaga re-checada
  -- pelo trigger de capacidade, fluxo B6).
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (NEW.status = 'cancelada')
     AND NOT (OLD.status = 'cancelada' AND NEW.status = 'reservada') THEN
    RAISE EXCEPTION 'Você só pode cancelar ou refazer sua inscrição — a confirmação é automática.'
      USING ERRCODE = '42501';
  END IF;

  -- tier: livre enquanto a contribuição não foi recebida.
  IF NEW.tier_id IS DISTINCT FROM OLD.tier_id
     AND EXISTS (
       SELECT 1 FROM public.payments p
       WHERE p.registration_id = NEW.id AND p.status = 'pago'
     ) THEN
    RAISE EXCEPTION 'A contribuição já foi recebida — o valor não pode mais ser alterado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_registration_write_rules() FROM PUBLIC, anon, authenticated;

-- Ordem dos BEFORE triggers (alfabética): trg_ceremony_capacity →
-- trg_registration_updated → trg_registration_write_guard. A capacidade
-- roda antes; se o guard abortar, a transação toda volta — inócuo.
DROP TRIGGER IF EXISTS trg_registration_write_guard ON public.registrations;
CREATE TRIGGER trg_registration_write_guard
  BEFORE INSERT OR UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_registration_write_rules();

-- ---------------------------------------------------------------------
-- F2 · simulate_payment fora de produção (D8)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.simulate_payment(uuid, numeric, uuid);

-- ---------------------------------------------------------------------
-- F3 · on_anamnese_change alinhada com refresh_registration_status (M3)
-- ---------------------------------------------------------------------
-- Antes: só 'reservada'/'confirmada'. refresh_registration_status aceita
-- promover tudo exceto cancelada/lista_espera/check_in — os filtros agora
-- são o mesmo conjunto.
CREATE OR REPLACE FUNCTION public.on_anamnese_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM registrations
    WHERE profile_id = NEW.profile_id
      AND status NOT IN ('cancelada','lista_espera','check_in')
  LOOP
    PERFORM refresh_registration_status(r.id);
  END LOOP;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- F4 · Staff-read de anamnese só para inscrições ativas (M1 · LGPD art. 11)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "anamnese - org staff when registered" ON public.anamneses;
CREATE POLICY "anamnese - org staff when registered" ON public.anamneses
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM registrations r
      JOIN ceremonies c ON c.id = r.ceremony_id
      WHERE r.profile_id = anamneses.profile_id
        AND r.status <> 'cancelada'
        AND is_org_member(c.org_id)
    )
  );

DROP POLICY IF EXISTS "anamnese-files - staff lê" ON storage.objects;
CREATE POLICY "anamnese-files - staff lê" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'anamnese-files'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.registrations r
      JOIN public.ceremonies c ON c.id = r.ceremony_id
      WHERE r.profile_id::text = (storage.foldername(objects.name))[1]
        AND r.status <> 'cancelada'
        AND public.is_org_member(c.org_id)
    )
  );

-- ---------------------------------------------------------------------
-- F5 · Avatar de condutor: escrita só org_admin (M6)
-- ---------------------------------------------------------------------
-- Path: conductors/{org_id}/{arquivo}. Comparação org_id::text = folder[2]
-- (sem cast do path — falha graciosa p/ paths fora do formato).
DROP POLICY IF EXISTS "ceremony-images - conductor avatar insert" ON storage.objects;
CREATE POLICY "ceremony-images - conductor avatar insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'conductors'
    AND (
      EXISTS (
        SELECT 1 FROM public.org_members m
        WHERE m.profile_id = auth.uid()
          AND m.role = 'org_admin'
          AND m.org_id::text = (storage.foldername(name))[2]
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "ceremony-images - conductor avatar update" ON storage.objects;
CREATE POLICY "ceremony-images - conductor avatar update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'conductors'
    AND (
      EXISTS (
        SELECT 1 FROM public.org_members m
        WHERE m.profile_id = auth.uid()
          AND m.role = 'org_admin'
          AND m.org_id::text = (storage.foldername(name))[2]
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "ceremony-images - conductor avatar delete" ON storage.objects;
CREATE POLICY "ceremony-images - conductor avatar delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'conductors'
    AND (
      EXISTS (
        SELECT 1 FROM public.org_members m
        WHERE m.profile_id = auth.uid()
          AND m.role = 'org_admin'
          AND m.org_id::text = (storage.foldername(name))[2]
      )
      OR public.is_super_admin()
    )
  );

-- ---------------------------------------------------------------------
-- F6 · ceremony-images: sem listagem pública (A5 · advisor 0025)
-- ---------------------------------------------------------------------
-- Download por URL pública NÃO passa por RLS (flag public do bucket).
-- A policy ampla de SELECT só servia para LISTAR — removida. Staff da org
-- continua listando (gestão de imagens/avatares no console).
-- Dois nomes históricos para a mesma policy: "…public read" (cadeia do repo,
-- v03) e "…leitura pública" (produção, criada ad-hoc) — mesmo drift da A1/v11.
DROP POLICY IF EXISTS "ceremony-images public read" ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images - leitura pública" ON storage.objects;
DROP POLICY IF EXISTS "ceremony-images - staff lê" ON storage.objects;
CREATE POLICY "ceremony-images - staff lê" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'ceremony-images'
    AND auth.role() = 'authenticated'
    AND (
      (
        (storage.foldername(name))[1] = 'conductors'
        AND EXISTS (
          SELECT 1 FROM public.org_members m
          WHERE m.profile_id = auth.uid()
            AND m.org_id::text = (storage.foldername(name))[2]
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.ceremonies c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND public.is_org_member(c.org_id)
      )
      OR public.is_super_admin()
    )
  );

-- ---------------------------------------------------------------------
-- F7 · Trilha LGPD: log_anamnese_view (M2)
-- ---------------------------------------------------------------------
-- O console chama ANTES de exibir a ficha. SECURITY DEFINER para escrever
-- em audit_log (INSERT não tem policy — só o servidor grava). Valida que o
-- chamador é staff de uma org onde a pessoa tem inscrição ativa (espelha a
-- policy de leitura F4 — quem não pode ler, não pode logar).
CREATE OR REPLACE FUNCTION public.log_anamnese_view(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org   uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;

  SELECT c.org_id INTO v_org
  FROM public.registrations r
  JOIN public.ceremonies c ON c.id = r.ceremony_id
  WHERE r.profile_id = p_profile_id
    AND r.status <> 'cancelada'
    AND public.is_org_member(c.org_id)
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para visualizar esta ficha.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, org_id)
  VALUES (v_actor, 'view_anamnese', 'profile', p_profile_id, v_org);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_anamnese_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_anamnese_view(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- F8 · Deprecação das colunas de tier da v10 (M7 · D3)
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.ceremonies.contribution_tiers IS
  'DEPRECATED (v13/D3, 2026-07-06): fonte única dos tiers é a tabela public.contribution_tiers (valores em REAIS). Esta coluna jsonb (centavos) nunca foi lida pelo app. Remoção física pendente de revisão explícita.';
COMMENT ON COLUMN public.registrations.chosen_contribution IS
  'DEPRECATED (v13/D3, 2026-07-06): o app grava registrations.tier_id; o valor histórico da cobrança fica em payments.amount. Remoção física pendente de revisão explícita.';
