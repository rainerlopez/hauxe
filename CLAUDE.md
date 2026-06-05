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

## Estado do banco (2026-06-04)
- 13 tabelas com RLS ativado em todas: organizations, profiles, org_members, conductors, ceremonies, ceremony_conductors, ceremony_images, contribution_tiers, anamneses, anamnese_revisions, registrations, payments, audit_log
- 24 RLS policies nas tabelas + 6 policies de Storage (ver abaixo)
- 5 enums: user_role, ceremony_status, registration_status (inclui 'reservada'), payment_status, payment_method
- View: registration_progress (SECURITY INVOKER) — calcula vaga_ok, ficha_ok, pagamento_ok
- Triggers de automação: trg_payment_status_sync e trg_anamnese_status_sync promovem inscrições para 'confirmada'
- Trigger on_auth_user_created cria profile automaticamente
- 2 Storage buckets: ceremony-images (público, leitura livre/escrita staff), anamnese-files (privado, espelha RLS de anamneses) — policies em db/hauxe_schema_patch_v03_storage.sql (APLICAR via SQL Editor). Convenção de caminho: {ceremony_id}/arquivo e {profile_id}/arquivo
- Migrations versionadas: db/hauxe_schema.sql, db/hauxe_schema_patch_v02.sql, db/hauxe_schema_patch_v03_storage.sql
- Security Advisor: 6 WARNs residuais intencionais (helpers RLS + rls_auto_enable do Supabase)

## Estado do app (2026-06-04)
- Build web validado (expo export -p web) com 0 erros; tsc --noEmit limpo
- Fluxos implementados (não são mais placeholders):
  - Auth completo: (auth)/sign-in, sign-up, verify (código 6 díg.), callback (magic link PKCE), check-email + AuthContext/useAuth
  - Hub (app)/index.tsx "Minha Inscrição": cerimônia ativa, vaga garantida, cartões de tarefa, progresso; revalida no foco (useFocusEffect)
  - (app)/anamnese.tsx: ficha de saúde LGPD com consentimento → upsert; trigger confirma a inscrição
  - (app)/contribuicao.tsx: escolha de tier, QR Code PIX + copia-e-cola (expo-clipboard), polling de confirmação
  - (app)/profile.tsx: email + logout
- Rotas anamnese/contribuicao registradas no (app)/_layout com href:null (não viram aba)
- src/lib/supabase.ts — cliente Supabase (PKCE, AsyncStorage, auto-refresh)
- src/theme/ — colors (dourado/verde, light/dark), typography (Schibsted Grotesk + Fraunces via @expo-google-fonts), spacing (base 8px), motion
- src/components/ — Screen, Button, TextField, Checkbox, RadioGroup
- src/features/auth, registration, anamnese (useAnamnese), payment (useContributionTiers, usePayment) — todos implementados
- supabase/functions/ — create-pix-charge e pix-webhook (Deno, service_role) com PROVEDOR MOCKADO; integração real Asaas/MercadoPago marcada como TODO (ver supabase/functions/README.md)
- .env.example com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY — falta .env real
- Sobras do template (app/(tabs)/, components/, constants/ da raiz, app/modal.tsx) já removidas

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

## Próximos passos previstos
- Criar .env real com keys do Supabase (bloqueia rodar o app)
- Aplicar db/hauxe_schema_patch_v03_storage.sql no Supabase (via SQL Editor)
- Integração real do provedor PIX (Asaas/MercadoPago) nas Edge Functions + deploy + secrets + URL do webhook
- Testar fim-a-fim no device: ficha → confirmação; PIX → confirmação (via MCP supabase ou update manual de payments enquanto provedor é mock)
- Render de QR Code: hoje usa imagem do provedor; avaliar geração no cliente se necessário
- LGPD: cifrar campos sensíveis de anamnese (pgsodium/Vault) em produção
- (nice) ESLint/Prettier + CI
