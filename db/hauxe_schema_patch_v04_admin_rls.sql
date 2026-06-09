-- =====================================================================
-- HAUXE — Patch v0.4 · Console da Kao (Fase 1) · RLS de leitura por staff
-- =====================================================================
-- Contexto: o app já tinha policies de staff para registrations, anamneses
-- e payments (todas via is_org_member(c.org_id)). Faltava UMA peça: a staff
-- não conseguia ler o `profiles` (nome/email/telefone) dos inscritos da sua
-- org — só o próprio profile e o super_admin.
--
-- Esta migration fecha essa lacuna, mantendo a MESMA lógica de isolamento
-- por org já usada nas demais tabelas: a staff só lê o profile de quem tem
-- inscrição em alguma cerimônia de uma org da qual ela é membro.
--
-- LGPD: a policy concede acesso por LINHA (o registro do participante).
-- A seleção de COLUNAS sensíveis (cpf, etc.) é responsabilidade da camada
-- de aplicação — o console só consulta os campos necessários por tela.
-- =====================================================================

-- Idempotente: recria a policy se já existir (permite reaplicar sem erro).
drop policy if exists "profiles - org staff read" on profiles;

create policy "profiles - org staff read" on profiles
  for select
  using (
    exists (
      select 1
      from registrations r
      join ceremonies c on c.id = r.ceremony_id
      where r.profile_id = profiles.id
        and is_org_member(c.org_id)
    )
  );

-- =====================================================================
-- NOTA sobre o modelo de anamnese (ponto de revisão LGPD, NÃO alterado aqui):
-- `anamneses` é 1 linha por profile (onConflict profile_id). Se uma pessoa
-- se inscreve em DUAS orgs distintas, a policy "anamnese - org staff when
-- registered" deixa a staff de AMBAS as orgs ver a MESMA ficha. Isso é
-- comportamento pré-existente do schema, não desta migration. Decidir em
-- fase futura se a ficha de saúde deve ser por (profile, org) em vez de
-- global por profile. Mudança de schema → requer aprovação explícita.
-- =====================================================================
