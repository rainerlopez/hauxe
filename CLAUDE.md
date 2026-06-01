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

## Estado do banco (2026-06-01)
- 13 tabelas com RLS ativado em todas: organizations, profiles, org_members, conductors, ceremonies, ceremony_conductors, ceremony_images, contribution_tiers, anamneses, anamnese_revisions, registrations, payments, audit_log
- 24 RLS policies
- 5 enums: user_role, ceremony_status, registration_status (inclui 'reservada'), payment_status, payment_method
- View: registration_progress (SECURITY INVOKER) — calcula vaga_ok, ficha_ok, pagamento_ok
- Triggers de automação: trg_payment_status_sync e trg_anamnese_status_sync promovem inscrições para 'confirmada'
- Trigger on_auth_user_created cria profile automaticamente
- 2 Storage buckets: ceremony-images (público), anamnese-files (privado) — sem policies ainda
- 5 migrations aplicadas (ver db/hauxe_schema.sql e db/hauxe_schema_patch_v02.sql)
- Security Advisor: 6 WARNs residuais intencionais (helpers RLS + rls_auto_enable do Supabase)

## Estado do app (2026-06-01)
- Scaffold funcional: build web validado com 0 erros
- Rotas: app/(auth)/sign-in.tsx, app/(app)/index.tsx + profile.tsx — todos placeholders
- src/lib/supabase.ts — cliente Supabase com react-native-url-polyfill
- src/theme/ — colors (dourado/verde, light/dark), typography (Schibsted Grotesk + Fraunces), spacing (base 8px), motion (120-300ms ease-out)
- src/features/{auth,anamnese,registration,payment}/ — placeholders
- .env.example com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY
- app/(tabs)/ legacy do template NÃO foi commitado — pode ser deletado
- components/ e constants/ na raiz vieram do template — migrar para src/ quando criar telas reais

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
- Criar .env real com keys do Supabase
- Baixar fontes Schibsted Grotesk e Fraunces para assets/fonts/
- Implementar telas de auth (sign-in, sign-up)
- Storage policies para os buckets
- Edge Function de webhook PIX
