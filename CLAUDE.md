@AGENTS.md

# Hauxe — Contexto do Projeto

## O que é
Plataforma multi-tenant para inscrição em cerimônias (espaços holísticos/terapêuticos).
Participantes se inscrevem, preenchem ficha de saúde (anamnese LGPD), e pagam via PIX.
Fluxo assíncrono: vaga garantida na inscrição → ficha e pagamento são pendências independentes → confirmação automática via triggers.

## Stack
- **Frontend:** Expo SDK 56 + Expo Router + TypeScript (iOS/Android/Web PWA-first)
- **Backend:** Supabase (projeto "hauxe", região sa-east-1) — usar MCP tools (mcp__supabase__*)
- **Pagamentos:** PIX via Asaas (Edge Functions integradas; sandbox validado fim-a-fim em 19/07)
- **Auth:** Supabase Auth com trigger on_auth_user_created
- **Gerenciador:** pnpm com node-linker=hoisted
- **Node:** v22.13.1 LTS (ver .nvmrc)

## Estado do banco (2026-07-06)
- 13 tabelas com RLS ativado em todas: organizations, profiles, org_members, conductors, ceremonies, ceremony_conductors, ceremony_images, contribution_tiers, anamneses, anamnese_revisions, registrations, payments, audit_log
- 5 enums: user_role (super_admin/org_admin/conductor/participant), ceremony_status, registration_status (inclui 'reservada'), payment_status, payment_method
- View: registration_progress (SECURITY INVOKER) — calcula vaga_ok, ficha_ok, pagamento_ok
- Triggers de automação: trg_payment_status_sync e trg_anamnese_status_sync promovem inscrições para 'confirmada'
- **v13 (guard de escrita, fecha o C2)**: trg_registration_write_guard — participante só cancela/reinscreve (cancelada→reservada), edita brings_food/notes e troca tier enquanto não pago; ceremony_id imutável p/ atores com JWT (trocar = cancelar+reinscrever); staff/service_role livres; sync interno passa via pg_trigger_depth()>1
- Trigger on_auth_user_created cria profile automaticamente; desde v12 grava profiles.cpf (11 dígitos, dos metadados do signUp)
- Trigger trg_anamnese_revision (AFTER UPDATE) → snapshot_anamnese_revision() SECURITY DEFINER → anamnese_revisions — versionado em db/hauxe_schema_patch_v03b_anamnese_revision.sql (resgatado de produção em 2026-07-19; era o último objeto sem SQL no repo)
- RPC log_anamnese_view(profile_id) SECURITY DEFINER — trilha LGPD em audit_log; o console SEMPRE chama antes de ler ficha
- simulate_payment REMOVIDA na v13 (era furo: participante se auto-pagava). Confirmação mock só via SQL privilegiado (ver supabase/functions/README.md)
- LGPD (v13): staff-read de anamnese (tabela + storage) limitado a inscrições com status <> 'cancelada'
- 2 Storage buckets: ceremony-images (público p/ download via URL; SEM listagem pública desde v13; escrita staff, avatar de condutor só org_admin), anamnese-files (privado, espelha RLS de anamneses). Caminhos: {ceremony_id}/arquivo, conductors/{org_id}/arquivo, {profile_id}/arquivo. Reconciliação de storage CONCLUÍDA (v05/v07b/v08/v11/v13 — não há mais pendência)
- Tiers: fonte única é a TABELA contribution_tiers (valores em REAIS; app + Edge Function). Colunas da v10 (ceremonies.contribution_tiers jsonb e registrations.chosen_contribution) DEPRECATED via COMMENT — remoção física pendente de revisão explícita (decisão D3, PROGRESSO.md)
- Migrations versionadas: db/hauxe_schema.sql + patches v02–v13, TODAS aplicadas no projeto (v13 = endurecimento pós-auditoria, aplicada 06/07). Suíte de testes em db/tests (run_all.sql, 48 casos, 48/48 PASS) — rodar com mock weekend/sql/00_supabase_mock.sql em Postgres local
- Security Advisor: WARNs residuais intencionais (helpers RLS SECURITY DEFINER, rls_auto_enable, log_anamnese_view, leaked-password OFF de propósito — CPF é a senha)

## Estado do app (2026-07-06)
- Build web validado (expo export -p web) com 0 erros; tsc --noEmit limpo
- Fluxos implementados:
  - Auth completo: e-mail = login, CPF = senha (signInWithPassword/signUp; CPF normalizado p/ 11 dígitos, validação de dígitos verificadores em src/features/auth/cpf.ts). (auth)/sign-in, sign-up, check-email (confirmação de cadastro), verify (código 6 díg., type signup), callback (link de confirmação PKCE) + AuthContext/useAuth. Ver ENTREGA-user-auth.md
  - **Inscrição (novo 06/07)**: hub sem inscrição lista cerimônias publicadas futuras; (app)/cerimonia/[id].tsx = convite/detalhe + "Garantir minha vaga" (porta do deep link do WhatsApp). useEnroll: INSERT nascendo 'reservada' ou UPDATE cancelada→reservada (B6); 'ceremony_full' tratado com acolhimento
  - Hub (app)/index.tsx "Minha Inscrição": cerimônia ativa, vaga garantida, cartões de tarefa, progresso; revalida no foco (useFocusEffect)
  - (app)/anamnese.tsx: ficha de saúde LGPD com consentimento → upsert; trigger confirma a inscrição
  - (app)/contribuicao.tsx: escolha de tier, QR Code PIX + copia-e-cola (expo-clipboard), polling de confirmação
  - (app)/profile.tsx: email + logout + link "Console da equipe" (condicional, só para staff)
  - Console app/admin/ (único — a duplicata (admin)/ foi removida em 06/07): dashboard, condutores (CRUD + avatar), **inscritos (novo 06/07)**: /admin/inscritos lista a próxima cerimônia com chips Ficha/PIX; /admin/inscritos/[id] mostra contato + ficha de saúde (log_anamnese_view SEMPRE antes — trilha LGPD) + check-in. Guard duplo (UX + RLS) via useStaffAccess
- Rotas anamnese/contribuicao/cerimonia/[id] registradas no (app)/_layout com href:null (não viram aba)
- src/lib/supabase.ts — cliente Supabase (PKCE, AsyncStorage, auto-refresh)
- src/theme/ — tokens FINAIS do Claude Design (paleta v3 Modo A: oliva #29402B + âmbar #C68A2E + areia #F6F2E9, light/dark), typography, spacing (base 8px), motion
- Fontes Schibsted Grotesk + Fraunces JÁ carregadas via useFonts no app/_layout.tsx (splash segura até carregar)
- src/components/ — Screen, Button, TextField, Checkbox, RadioGroup
- src/features/auth, registration (useRegistration, useAvailableCeremonies, useEnroll), anamnese (useAnamnese), payment (useContributionTiers, usePayment), admin (useStaffAccess, useConductors, useOrgRegistrations, useAnamneseFor) — todos implementados
- supabase/functions/ — create-pix-charge e pix-webhook com integração REAL do Asaas (19/07): PIX_PROVIDER=asaas ativa cliente-por-CPF + cobrança PIX + QR; sem a env, modo mock. Webhook valida asaas-access-token (constant-time), fail-closed. A3 fechado (valor derivado do tier no servidor + tier validado contra a cerimônia). Secrets SANDBOX configurados no projeto; fim-a-fim validado 19/07 (cobrança sandbox → pagamento simulado → webhook → payments.pago via trigger). Produção: trocar ASAAS_API_KEY/ASAAS_BASE_URL p/ produção + recriar webhook no painel Asaas de produção (ver supabase/functions/README.md)
- .env.example com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY — .env real necessário

## Design tokens
- Tokens finais do Claude Design em src/theme/colors.ts (paleta v3 Modo A): oliva #29402B / #1B301E, âmbar #C68A2E, areia #F6F2E9, floresta noturna #10201A (dark)
- Tipografia: Schibsted Grotesk (corpo/UI) + Fraunces (display/títulos) — carregadas via expo-font/useFonts
- Espaçamento: base 8px
- Motion: micro 140ms, transição 270ms, expressiva 400ms — easing ease-out (bezier 0,0,0.2,1)

## Regras de trabalho
- Idioma: PT-BR
- Trabalhar por etapas, reportar resultado de cada uma antes de prosseguir
- NUNCA improvisar schema — se algo parecer inconsistente, PARAR e perguntar
- Usar tokens de src/theme/ nos componentes, nunca hardcodar valores
- LGPD: toda decisão de schema/API/UI deve considerar privacidade dos dados de saúde

## Decisões de design (não mexa sem revisão explícita)
- **Anamnese global por pessoa (LGPD):** `anamneses` é 1 linha por `profile_id` (global), não por org. Se uma pessoa se inscreve em duas orgs, a staff de ambas vê a mesma ficha. Decisão consciente para a fase atual. Revisitar em fase futura multi-espaço: avaliar migrar para `(profile_id, org_id)` ou criptografia por org. **NÃO alterar sem aprovação explícita.**

## Próximos passos previstos
> Andamento detalhado + decisões D1–D9 em **PROGRESSO.md** (fonte da verdade da etapa atual)
- Virada do PIX sandbox → produção: chave de API + webhook no painel Asaas de PRODUÇÃO, atualizar secrets (ASAAS_API_KEY, ASAAS_BASE_URL=https://api.asaas.com/v3), rotacionar PIX_WEBHOOK_SECRET — **depende de conta Asaas de produção (Bruno)**
- Ações de painel que só o Rainer pode fazer: repo privado, template "Confirm signup" com {{ .Token }}, decidir desligar OTP/magic link, CPF do 2º usuário (lista completa em PROGRESSO.md)
- Testar fim-a-fim no device: inscrição → ficha → PIX → confirmação; teste visual do console
- Criação/edição de cerimônia no console (Fase 3b) — hoje cerimônia e tiers nascem via SQL
- Render de QR Code: hoje usa imagem do provedor; avaliar geração no cliente se necessário
- LGPD: cifrar campos sensíveis de anamnese (pgsodium/Vault) em produção
- CI (GitHub Actions)
