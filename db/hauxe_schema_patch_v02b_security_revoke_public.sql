-- =====================================================================
-- Hauxe · Patch v02b — Endurecimento de EXECUTE em funções internas
-- =====================================================================
-- RESGATE DE VERSIONAMENTO (2026-07-19): aplicado em produção em
-- 2026-06-01 (migration 20260601181854, "patch_v02_security_revoke_public")
-- mas nunca versionado no git. Conteúdo recuperado verbatim de
-- supabase_migrations.schema_migrations. JÁ APLICADO em produção —
-- necessário apenas para reconstruir ambientes novos a partir do repo.
-- Idempotente.
-- =====================================================================

-- Corrige set_updated_at: adiciona search_path fixo (fecha o WARN de mutable search_path)
create or replace function set_updated_at()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- Revogar EXECUTE de PUBLIC nas funções internas (trigger functions + helpers internos)
-- Trigger functions nunca devem ser chamadas via REST
revoke execute on function set_updated_at()                         from public;
revoke execute on function handle_new_user()                        from public;
revoke execute on function on_payment_change()                      from public;
revoke execute on function on_anamnese_change()                     from public;
revoke execute on function refresh_registration_status(uuid)        from public;

-- Helpers de RLS: revogar de PUBLIC e re-conceder só a authenticated + anon
-- (anon precisa para policies de leitura anônima de cerimônias publicadas)
revoke execute on function is_super_admin()         from public;
revoke execute on function is_org_member(uuid)      from public;
grant  execute on function is_super_admin()         to authenticated, anon;
grant  execute on function is_org_member(uuid)      to authenticated, anon;
