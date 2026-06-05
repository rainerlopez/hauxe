-- =====================================================================
-- HAUXE — Schema inicial (Supabase / PostgreSQL)
-- Multi-tenant, com RLS e foco em LGPD (dados sensíveis de saúde).
-- Rode no SQL Editor do Supabase ou como migration versionada.
-- v0.1 · Maio 2026
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type user_role           as enum ('super_admin','org_admin','conductor','participant');
create type ceremony_status     as enum ('rascunho','publicada','encerrada','cancelada');
create type registration_status as enum ('pendente','aguardando_pagamento','confirmada','lista_espera','cancelada','check_in');
create type payment_status      as enum ('pendente','pago','expirado','estornado','falhou');
create type payment_method      as enum ('pix','manual','outro');

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- =====================================================================
-- ORGANIZATIONS (raiz multi-tenant)
-- =====================================================================
create table organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  description  text,
  address      text,
  city         text,
  state        text,
  whatsapp     text,
  pix_provider text,                 -- 'asaas' | 'mercadopago' | ...
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_org_updated before update on organizations
  for each row execute function set_updated_at();

-- =====================================================================
-- PROFILES (estende auth.users) — pessoa GLOBAL
-- =====================================================================
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  email      text,
  phone      text,
  cpf        text,
  role       user_role not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profile_updated before update on profiles
  for each row execute function set_updated_at();

-- cria profile automaticamente quando um auth.user é criado
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          new.email,
          new.phone);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
-- ORG_MEMBERS (staff: admins / condutores ↔ org)
-- =====================================================================
create table org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       user_role not null default 'org_admin',
  created_at timestamptz not null default now(),
  primary key (org_id, profile_id)
);
create index on org_members (profile_id);

-- ---------- Helpers de autorização (security definer p/ evitar recursão de RLS) ----------
create or replace function is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and profile_id = auth.uid()
  ) or is_super_admin();
$$;

-- =====================================================================
-- CONDUCTORS (condutores do espaço)
-- =====================================================================
create table conductors (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  bio        text,
  avatar_url text,
  created_at timestamptz not null default now()
);
create index on conductors (org_id);

-- =====================================================================
-- CEREMONIES
-- =====================================================================
create table ceremonies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  title            text not null,
  description      text,
  status           ceremony_status not null default 'rascunho',
  arrival_at       timestamptz,            -- janela de chegada
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  capacity         int check (capacity is null or capacity > 0),
  food_donation_kg numeric default 1,      -- contribuição de alimento sugerida
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on ceremonies (org_id, starts_at);
create trigger trg_ceremony_updated before update on ceremonies
  for each row execute function set_updated_at();

-- =====================================================================
-- CEREMONY_CONDUCTORS (N:N — múltiplos condutores por cerimônia)
-- =====================================================================
create table ceremony_conductors (
  ceremony_id  uuid not null references ceremonies(id) on delete cascade,
  conductor_id uuid not null references conductors(id) on delete cascade,
  primary key (ceremony_id, conductor_id)
);

-- =====================================================================
-- CEREMONY_IMAGES (uploads; uma marcada como flyer)
-- =====================================================================
create table ceremony_images (
  id           uuid primary key default gen_random_uuid(),
  ceremony_id  uuid not null references ceremonies(id) on delete cascade,
  storage_path text not null,            -- caminho no Supabase Storage
  is_flyer     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on ceremony_images (ceremony_id);
-- garante no máximo 1 flyer por cerimônia
create unique index one_flyer_per_ceremony
  on ceremony_images (ceremony_id) where is_flyer;

-- =====================================================================
-- CONTRIBUTION_TIERS (valores: 160/180/200 — contribuição consciente)
-- =====================================================================
create table contribution_tiers (
  id          uuid primary key default gen_random_uuid(),
  ceremony_id uuid not null references ceremonies(id) on delete cascade,
  label       text,                      -- ex.: 'apoio', 'padrão', 'padrinho'
  amount      numeric(10,2) not null check (amount >= 0),
  sort_order  int not null default 0
);
create index on contribution_tiers (ceremony_id);

-- =====================================================================
-- ANAMNESES (UMA por pessoa) — DADO SENSÍVEL DE SAÚDE (LGPD Art. 5, II)
-- =====================================================================
create table anamneses (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null unique references profiles(id) on delete cascade,
  emergency_contact_name  text,
  emergency_contact_phone text,
  uses_medication         boolean,
  medications             text,
  psychiatric_history     boolean,
  psychiatric_details     text,
  cardiac_history         boolean,
  cardiac_details         text,
  other_conditions        text,
  pregnant                boolean,
  allergies               text,
  previous_experience     boolean,
  responses               jsonb default '{}'::jsonb,           -- questionário flexível
  consent_health_data     boolean not null default false,      -- consentimento LGPD explícito
  consent_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger trg_anamnese_updated before update on anamneses
  for each row execute function set_updated_at();
-- NOTA LGPD: campos sensíveis (medications, *_details) devem ser
-- criptografados em coluna (pgsodium / Supabase Vault) em produção.

-- histórico de revisões (auditoria / direito de portabilidade LGPD)
create table anamnese_revisions (
  id          uuid primary key default gen_random_uuid(),
  anamnese_id uuid not null references anamneses(id) on delete cascade,
  snapshot    jsonb not null,
  changed_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index on anamnese_revisions (anamnese_id);

-- =====================================================================
-- REGISTRATIONS (inscrição: pessoa ↔ cerimônia)
-- =====================================================================
create table registrations (
  id          uuid primary key default gen_random_uuid(),
  ceremony_id uuid not null references ceremonies(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  tier_id     uuid references contribution_tiers(id),
  status      registration_status not null default 'aguardando_pagamento',
  brings_food boolean default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (ceremony_id, profile_id)       -- uma inscrição por pessoa por cerimônia
);
create index on registrations (ceremony_id, status);
create index on registrations (profile_id);
create trigger trg_registration_updated before update on registrations
  for each row execute function set_updated_at();

-- =====================================================================
-- PAYMENTS (PIX) — confirmação escrita pelo webhook via service_role
-- =====================================================================
create table payments (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  method          payment_method not null default 'pix',
  status          payment_status not null default 'pendente',
  amount          numeric(10,2) not null,
  provider        text,                  -- 'asaas' | 'mercadopago'
  provider_txid   text,                  -- id único da cobrança / txid PIX
  qr_code         text,                  -- copia-e-cola
  qr_code_image   text,                  -- url/base64 do QR
  paid_at         timestamptz,
  raw_payload     jsonb,                 -- retorno bruto do webhook (auditoria)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on payments (registration_id);
create index on payments (provider_txid);
create trigger trg_payment_updated before update on payments
  for each row execute function set_updated_at();

-- =====================================================================
-- AUDIT_LOG (acesso a dados sensíveis — LGPD)
-- =====================================================================
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id),
  action      text not null,             -- ex.: 'view_anamnese'
  target_type text,
  target_id   uuid,
  org_id      uuid references organizations(id),
  created_at  timestamptz not null default now()
);
create index on audit_log (target_type, target_id);

-- =====================================================================
-- RLS — ativar em todas as tabelas
-- =====================================================================
alter table organizations       enable row level security;
alter table profiles            enable row level security;
alter table org_members         enable row level security;
alter table conductors          enable row level security;
alter table ceremonies          enable row level security;
alter table ceremony_conductors enable row level security;
alter table ceremony_images     enable row level security;
alter table contribution_tiers  enable row level security;
alter table anamneses           enable row level security;
alter table anamnese_revisions  enable row level security;
alter table registrations       enable row level security;
alter table payments            enable row level security;
alter table audit_log           enable row level security;

-- ---------- PROFILES ----------
create policy "profiles - own select" on profiles
  for select using (id = auth.uid() or is_super_admin());
create policy "profiles - own update" on profiles
  for update using (id = auth.uid());

-- ---------- ORGANIZATIONS ----------
create policy "orgs - members read" on organizations
  for select using (is_org_member(id));
create policy "orgs - super admin all" on organizations
  for all using (is_super_admin()) with check (is_super_admin());

-- ---------- ORG_MEMBERS ----------
create policy "org_members - read" on org_members
  for select using (is_org_member(org_id));

-- ---------- CONDUCTORS ----------
create policy "conductors - read" on conductors
  for select using (
    is_org_member(org_id)
    or exists (
      select 1 from ceremony_conductors cc
      join ceremonies c on c.id = cc.ceremony_id
      where cc.conductor_id = conductors.id and c.status = 'publicada'
    )
  );
create policy "conductors - staff manage" on conductors
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- CEREMONIES ----------
-- qualquer pessoa pode LER cerimônias publicadas (para se inscrever via link)
create policy "ceremonies - read published" on ceremonies
  for select using (status = 'publicada' or is_org_member(org_id));
create policy "ceremonies - staff manage" on ceremonies
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- CEREMONY_CONDUCTORS ----------
create policy "ceremony_conductors - read" on ceremony_conductors
  for select using (
    exists (select 1 from ceremonies c where c.id = ceremony_id
            and (c.status = 'publicada' or is_org_member(c.org_id)))
  );
create policy "ceremony_conductors - staff manage" on ceremony_conductors
  for all using (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  ) with check (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  );

-- ---------- CEREMONY_IMAGES ----------
create policy "ceremony_images - read" on ceremony_images
  for select using (
    exists (select 1 from ceremonies c where c.id = ceremony_id
            and (c.status = 'publicada' or is_org_member(c.org_id)))
  );
create policy "ceremony_images - staff manage" on ceremony_images
  for all using (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  ) with check (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  );

-- ---------- CONTRIBUTION_TIERS ----------
create policy "tiers - read" on contribution_tiers
  for select using (
    exists (select 1 from ceremonies c where c.id = ceremony_id
            and (c.status = 'publicada' or is_org_member(c.org_id)))
  );
create policy "tiers - staff manage" on contribution_tiers
  for all using (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  ) with check (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  );

-- ---------- ANAMNESES (sensível) ----------
-- o DONO sempre; a EQUIPE do espaço SOMENTE quando a pessoa tem
-- inscrição em alguma cerimônia daquela org.
create policy "anamnese - owner" on anamneses
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "anamnese - org staff when registered" on anamneses
  for select using (
    exists (
      select 1 from registrations r
      join ceremonies c on c.id = r.ceremony_id
      where r.profile_id = anamneses.profile_id
        and is_org_member(c.org_id)
    )
  );

-- ---------- ANAMNESE_REVISIONS ----------
create policy "anamnese_rev - owner read" on anamnese_revisions
  for select using (
    exists (select 1 from anamneses a where a.id = anamnese_id and a.profile_id = auth.uid())
  );

-- ---------- REGISTRATIONS ----------
create policy "registrations - owner" on registrations
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "registrations - org staff read" on registrations
  for select using (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  );
create policy "registrations - org staff update" on registrations
  for update using (
    exists (select 1 from ceremonies c where c.id = ceremony_id and is_org_member(c.org_id))
  );

-- ---------- PAYMENTS ----------
create policy "payments - owner read" on payments
  for select using (
    exists (select 1 from registrations r where r.id = registration_id and r.profile_id = auth.uid())
  );
create policy "payments - org staff read" on payments
  for select using (
    exists (
      select 1 from registrations r
      join ceremonies c on c.id = r.ceremony_id
      where r.id = registration_id and is_org_member(c.org_id)
    )
  );

-- ---------- AUDIT_LOG ----------
create policy "audit - org staff read" on audit_log
  for select using (org_id is not null and is_org_member(org_id));

-- =====================================================================
-- STORAGE: buckets e policies aplicados em hauxe_schema_patch_v03_storage.sql
--   - bucket 'ceremony-images' público para leitura (flyers); escrita staff.
--   - bucket 'anamnese-files' privado, policy espelhando a RLS de anamneses.
-- WEBHOOK PIX: a Edge Function usa a SERVICE ROLE KEY (ignora RLS) para
--   atualizar payments.status e registrations.status -> 'confirmada'.
--   (esqueletos em supabase/functions/, ver README)
-- =====================================================================
