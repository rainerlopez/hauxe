-- =====================================================================
-- HAUXE — Patch v0.2 · Modelo de inscrição assíncrona
-- Vaga garantida na inscrição; ficha e pagamento = pendências independentes.
-- Aplicar SOBRE o hauxe_schema.sql (v0.1).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NOVO STATUS: 'reservada' (vaga garantida, pendências em aberto)
--    Postgres não reordena enums, mas podemos adicionar valores novos.
--    'reservada' = vaga ok, falta ficha e/ou pagamento.
--    'confirmada' = ficha + pagamento completos.
-- ---------------------------------------------------------------------
alter type registration_status add value if not exists 'reservada' before 'confirmada';

-- Novo default: ao se inscrever, a vaga já nasce garantida.
alter table registrations
  alter column status set default 'reservada';

-- ---------------------------------------------------------------------
-- 2. A inscrição não exige mais tier no momento da reserva.
--    A pessoa escolhe o valor quando for pagar (pode reservar sem definir).
-- ---------------------------------------------------------------------
-- (tier_id já é nullable no schema v0.1 — nada a fazer, apenas confirmando intenção.)

-- ---------------------------------------------------------------------
-- 3. VIEW de pendências: calcula o estado real de cada inscrição
--    combinando vaga + ficha (anamnese da pessoa) + pagamento.
--    A vaga NUNCA depende de ficha/pagamento.
-- ---------------------------------------------------------------------
create or replace view registration_progress as
select
  r.id                                   as registration_id,
  r.ceremony_id,
  r.profile_id,
  r.status,
  -- vaga: garantida desde que não cancelada / fora da lista de espera
  (r.status not in ('cancelada','lista_espera')) as vaga_ok,
  -- ficha: existe anamnese da pessoa COM consentimento
  exists (
    select 1 from anamneses a
    where a.profile_id = r.profile_id
      and a.consent_health_data = true
  )                                      as ficha_ok,
  -- pagamento: existe pagamento pago para esta inscrição
  exists (
    select 1 from payments p
    where p.registration_id = r.id
      and p.status = 'pago'
  )                                      as pagamento_ok
from registrations r;

-- ---------------------------------------------------------------------
-- 4. AUTOMAÇÃO: promover para 'confirmada' quando ficha + pagamento
--    estiverem completos; voltar para 'reservada' se algo faltar.
--    Disparado por mudanças em payments e anamneses.
-- ---------------------------------------------------------------------
create or replace function refresh_registration_status(p_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ficha_ok boolean;
  v_pagto_ok boolean;
  v_status   registration_status;
begin
  select status into v_status from registrations where id = p_registration_id;
  if v_status in ('cancelada','lista_espera','check_in') then
    return; -- não mexer nesses estados terminais/manuais
  end if;

  select ficha_ok, pagamento_ok
    into v_ficha_ok, v_pagto_ok
    from registration_progress
   where registration_id = p_registration_id;

  if v_ficha_ok and v_pagto_ok then
    update registrations set status = 'confirmada'
      where id = p_registration_id and status <> 'confirmada';
  else
    update registrations set status = 'reservada'
      where id = p_registration_id and status <> 'reservada';
  end if;
end; $$;

-- gatilho quando um pagamento muda (ex.: webhook confirma o PIX)
create or replace function on_payment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_registration_status(new.registration_id);
  return new;
end; $$;

create trigger trg_payment_status_sync
  after insert or update of status on payments
  for each row execute function on_payment_change();

-- gatilho quando a anamnese da pessoa muda (preencheu / deu consentimento)
-- atualiza TODAS as inscrições reservadas dessa pessoa
create or replace function on_anamnese_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select id from registrations
    where profile_id = new.profile_id
      and status in ('reservada','confirmada')
  loop
    perform refresh_registration_status(r.id);
  end loop;
  return new;
end; $$;

create trigger trg_anamnese_status_sync
  after insert or update of consent_health_data on anamneses
  for each row execute function on_anamnese_change();

-- ---------------------------------------------------------------------
-- 5. RESUMO DO NOVO MODELO
--    • Inscrever     -> registrations.status = 'reservada' (vaga garantida)
--    • Preencher ficha (a qualquer momento) -> trigger reavalia
--    • Pagar PIX      (a qualquer momento)   -> trigger reavalia
--    • ficha_ok && pagamento_ok               -> 'confirmada' automático
--    A tela "Minha inscrição" lê de registration_progress para mostrar
--    vaga_ok / ficha_ok / pagamento_ok e as pendências amigáveis.
-- =====================================================================
