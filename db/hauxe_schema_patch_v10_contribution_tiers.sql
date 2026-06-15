-- =====================================================================
-- HAUXE — Patch v10 · Contribuição: tiers por cerimônia + valor escolhido
-- =====================================================================
-- Decisão de produto: a contribuição passa a ser 3 valores (1–5) definidos
-- pelo admin POR CERIMÔNIA. Esta migração é SÓ banco; a UI de admin (3b) e a
-- troca do client vêm depois.
--
-- Convenção de UNIDADE: CENTAVOS (inteiros). Ex.: R$160,00 → 16000.
--   (difere da tabela legada public.contribution_tiers, cujo amount é numeric
--    em REAIS e é o que o client lê hoje via useContributionTiers + tier_id.
--    Reconciliar/aposentar a tabela legada fica para a fase de UI/client.)
--
-- NULL = cerimônia sem contribuição configurada / inscrição sem escolha ainda.
--
-- RLS: nenhuma policy nova. As colunas herdam as policies das tabelas. O
-- participante grava chosen_contribution via a policy "registrations - owner"
-- (ALL, profile_id = auth.uid()), que já permite UPDATE da própria linha.
--
-- Idempotente. Sem ALTER TYPE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ceremonies.contribution_tiers — array JSON de 1 a 5 inteiros > 0 (centavos)
-- ---------------------------------------------------------------------
ALTER TABLE ceremonies
  ADD COLUMN IF NOT EXISTS contribution_tiers jsonb NULL;

-- CHECK sem subquery/SRF (não permitido em constraints): usa jsonb_path_exists.
-- A negação do path captura qualquer elemento "ruim" (não-número, <= 0, ou
-- não-inteiro via @.floor() != @). Type-check vem primeiro no `||` para que o
-- modo lax do jsonpath não erre ao comparar não-números.
ALTER TABLE ceremonies DROP CONSTRAINT IF EXISTS ceremonies_contribution_tiers_check;
ALTER TABLE ceremonies ADD CONSTRAINT ceremonies_contribution_tiers_check CHECK (
  contribution_tiers IS NULL OR (
    jsonb_typeof(contribution_tiers) = 'array'
    AND jsonb_array_length(contribution_tiers) BETWEEN 1 AND 5
    AND NOT jsonb_path_exists(
      contribution_tiers,
      '$[*] ? (@.type() != "number" || @ <= 0 || @.floor() != @)'
    )
  )
);

-- ---------------------------------------------------------------------
-- 2. registrations.chosen_contribution — valor escolhido (centavos)
--    NÃO validado contra os tiers da cerimônia: o admin pode mudar os tiers
--    depois e não queremos quebrar registrations antigas. A UI valida na escolha.
-- ---------------------------------------------------------------------
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS chosen_contribution integer NULL;

ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_chosen_contribution_check;
ALTER TABLE registrations ADD CONSTRAINT registrations_chosen_contribution_check CHECK (
  chosen_contribution IS NULL OR chosen_contribution > 0
);
