@AGENTS.md

# Hauxe — Contexto do Projeto

## O que é
Plataforma multi-tenant para inscrição em cerimônias (espaços holísticos/terapêuticos).
Participantes se inscrevem, preenchem ficha de saúde (anamnese LGPD), e pagam via PIX.
Fluxo assíncrono: vaga garantida na inscrição → ficha e pagamento são pendências independentes → confirmação automática via triggers.

## Stack
- **Frontend:** Expo SDK 56 + Expo Router + TypeScript (iOS/Android/Web PWA-first)
- **Backend:** Supabase (projeto "hauxe", região sa-east-1) — usar MCP tools (mcp__supabase__*)
- **Pagamentos:** PIX via Asaas/MercadoPago (Edge Function planejada)
- **Auth:** Supabase Auth com trigger on_auth_user_created
- **Gerenciador:** pnpm com node-linker=hoisted
- **Node:** v22.13.1 LTS (ver .nvmrc)

## Estado do banco (2026-06-09)
- 13 tabelas com RLS ativado em todas: organizations, profiles, org_members, conductors, ceremonies, ceremony_conductors, ceremony_images, contribution_tiers, anamneses, anamnese_revisions, registrations, payments, audit_log
- 25 RLS policies nas tabelas + 6 policies de Storage (reconciliação storage pendente — ver abaixo)
- 5 enums: user_role (super_admin/org_admin/conductor/participant), ceremony_status, registration_status (inclui 'reservada'), payment_status, payment_method
- View: registration_progress (SECURITY INVOKER) — calcula vaga_ok, ficha_ok, pagamento_ok
- Triggers de automação: trg_payment_status_sync e trg_anamnese_status_sync promovem inscrições para 'confirmada'
- Trigger on_auth_user_created cria profile automaticamente; desde o patch v12 também grava profiles.cpf (11 dígitos, dos metadados do signUp) — v12 APLICADA no projeto (migration 20260705154527)
- Trigger trg_anamnese_revision (AFTER UPDATE) → snapshot_anamnese_revision() SECURITY DEFINER → anamnese_revisions
- Função simulate_payment(registration_id, amount, tier_id) SECURITY DEFINER — mock PIX para testes
- 2 Storage buckets: ceremony-images (público, leitura livre/escrita staff), anamnese-files (privado, espelha RLS de anamneses). Convenção de caminho: {ceremony_id}/arquivo e {profile_id}/arquivo
- Migrations versionadas: db/hauxe_schema.sql + patches v02–v10 e v12 (cpf capture; v11 = fixes de segurança na branch claude/weekend-integration, não mergeada). Suíte de testes em db/tests (run_all.sql)
- Security Advisor: 6 WARNs residuais intencionais (helpers RLS + rls_auto_enable do Supabase)
- PENDENTE: reconciliar policies de storage (db/v05) — 2 policies de ceremony-images com lógica errada (folder tratado como org_id em vez de ceremony_id); staff-read de anamnese-files ausente

## Estado do app (2026-06-09)
- Build web validado (expo export -p web) com 0 erros; tsc --noEmit limpo
- Fluxos implementados:
  - Auth completo: e-mail = login, CPF = senha (signInWithPassword/signUp; CPF normalizado p/ 11 dígitos, validação de dígitos verificadores em src/features/auth/cpf.ts). (auth)/sign-in, sign-up, check-email (confirmação de cadastro), verify (código 6 díg., type signup), callback (link de confirmação PKCE) + AuthContext/useAuth. Ver ENTREGA-user-auth.md
  - Hub (app)/index.tsx "Minha Inscrição": cerimônia ativa, vaga garantida, cartões de tarefa, progresso; revalida no foco (useFocusEffect)
  - (app)/anamnese.tsx: ficha de saúde LGPD com consentimento → upsert; trigger confirma a inscrição
  - (app)/contribuicao.tsx: escolha de tier, QR Code PIX + copia-e-cola (expo-clipboard), polling de confirmação
  - (app)/profile.tsx: email + logout + link "Console da equipe" (condicional, só para staff)
  - Console (admin)/index.tsx: área de staff com guard duplo (UX + RLS); hook useStaffAccess detecta orgs onde o usuário é staff
- Rotas anamnese/contribuicao registradas no (app)/_layout com href:null (não viram aba)
- src/lib/supabase.ts — cliente Supabase (PKCE, AsyncStorage, auto-refresh)
- src/theme/ — colors (dourado/verde, light/dark), typography (Schibsted Grotesk + Fraunces via @expo-google-fonts), spacing (base 8px), motion
- src/components/ — Screen, Button, TextField, Checkbox, RadioGroup
- src/features/auth, registration, anamnese (useAnamnese), payment (useContributionTiers, usePayment), admin (useStaffAccess) — todos implementados
- supabase/functions/ — create-pix-charge e pix-webhook (Deno, service_role) com PROVEDOR MOCKADO; integração real Asaas/MercadoPago marcada como TODO (ver supabase/functions/README.md)
- .env.example com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY — .env real necessário

## Design tokens
- Paleta Modo A (dourado): gold400 #D4A017 (light), gold300 #E8C148 (dark)
- Verde da marca: green400 #27AE60
- Tipografia: Schibsted Grotesk (corpo/UI) + Fraunces (display/títulos) — fontes ainda não carregadas via expo-font
- Espaçamento: base 8px
- Motion: micro 140ms, transição 270ms, expressiva 400ms — easing ease-out (bezier 0,0,0.2,1)
- Valores finais virão do export do Claude Design / Figma tokens

## Regras de trabalho
- Idioma: PT-BR
- Trabalhar por etapas, reportar resultado de cada uma antes de prosseguir
- NUNCA improvisar schema — se algo parecer inconsistente, PARAR e perguntar
- Usar tokens de src/theme/ nos componentes, nunca hardcodar valores
- LGPD: toda decisão de schema/API/UI deve considerar privacidade dos dados de saúde

## Decisões de design (não mexa sem revisão explícita)
- **Anamnese global por pessoa (LGPD):** `anamneses` é 1 linha por `profile_id` (global), não por org. Se uma pessoa se inscreve em duas orgs, a staff de ambas vê a mesma ficha. Decisão consciente para a fase atual. Revisitar em fase futura multi-espaço: avaliar migrar para `(profile_id, org_id)` ou criptografia por org. **NÃO alterar sem aprovação explícita.**

## Próximos passos previstos
- **Console da Kao Fase 2:** lista de inscritos + fichas de saúde (aguarda OK após teste visual do /admin)
- Reconciliar storage policies (db/v05) — aguardando OK do plano mostrado na conversa
- Integração real do provedor PIX (Asaas/MercadoPago) nas Edge Functions + deploy + secrets + URL do webhook
- Testar fim-a-fim no device: ficha → confirmação; PIX → confirmação
- Render de QR Code: hoje usa imagem do provedor; avaliar geração no cliente se necessário
- LGPD: cifrar campos sensíveis de anamnese (pgsodium/Vault) em produção
- CI (GitHub Actions)
