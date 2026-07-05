-- =====================================================================
-- HAUXE — Patch v12 · Captura de CPF no cadastro (profiles.cpf)
-- =====================================================================
-- Contexto: o login passou a ser e-mail (usuário) + CPF (senha) na branch
-- claude/user-auth. O CPF vira hash de senha no Auth, mas a coluna
-- profiles.cpf (que existe desde o v01 e nunca foi populada) passa a ser
-- preenchida no cadastro: o app envia o CPF nos metadados do signUp e o
-- trigger handle_new_user() grava a versão normalizada (11 dígitos).
--
-- Numeração: v11 está reservada pela migration de segurança da branch
-- claude/weekend-integration (ainda não mergeada). Este patch é v12 e
-- independe dela — pode ser aplicado antes ou depois.
--
-- LGPD: nenhuma policy nova. profiles.cpf herda o RLS existente por LINHA
-- (own select/update, staff da org via inscrição — v04, super_admin). Vale a
-- nota do v04: a exposição da COLUNA cpf é responsabilidade da camada de
-- aplicação — o console só consulta os campos necessários por tela.
--
-- Decisões desta migration:
--   • Normalização no banco: só persiste CPF com exatamente 11 dígitos;
--     qualquer outra coisa vira NULL (a validação de dígitos verificadores
--     fica no cliente — src/features/auth/cpf.ts).
--   • CHECK de higiene (NULL ou 11 dígitos) para proteger escritas manuais
--     (a policy "profiles - own update" permite o dono editar a própria linha).
--   • SEM unicidade por enquanto: duas contas com o mesmo CPF não são
--     bloqueadas. Impor UNIQUE é decisão de produto (bloquearia recadastro
--     com outro e-mail) — fica para revisão explícita.
--   • Sem backfill: usuários pré-existentes ficam com cpf NULL até a
--     migração de acesso (definir CPF como senha) prevista na entrega.
--
-- Idempotente. Sem ALTER TYPE. Sem mudança de policies.
-- =====================================================================

-- Higiene de formato (idempotente): NULL ou exatamente 11 dígitos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_cpf_digits' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_cpf_digits check (cpf is null or cpf ~ '^\d{11}$');
  end if;
end $$;

-- handle_new_user(): passa a capturar raw_user_meta_data->>'cpf'.
-- Mantém o comportamento anterior para full_name/email/phone.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cpf text := nullif(
    regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'),
    ''
  );
begin
  -- Só persiste CPF plausível (11 dígitos); resto vira NULL para não
  -- derrubar a criação da conta no CHECK acima.
  if v_cpf is not null and v_cpf !~ '^\d{11}$' then
    v_cpf := null;
  end if;

  insert into public.profiles (id, full_name, email, phone, cpf)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          new.email,
          new.phone,
          v_cpf);
  return new;
end; $$;
