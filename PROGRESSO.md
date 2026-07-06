# PROGRESSO — Fechamento da etapa (plano de ataque)

> **Documento de continuidade.** Se a sessão do Claude resetar, retome por aqui:
> ler este arquivo → conferir o checklist → continuar da primeira caixa aberta.
> Branch de trabalho: `claude/supabase-user-cpf-update-rlk691`.
> Contexto completo da review: conversa de 06/07/2026 + `weekend/MONDAY-BRIEF.md`.

**Objetivo da etapa:** uma pessoa real se inscreve pelo app, preenche a ficha,
paga PIX (mock por ora — provedor real depende de credenciais), e a Kao vê
inscritos + fichas no console. Sem furo de segurança conhecido aberto.
**Prazo natural:** cerimônia de 19/07/2026 (Paka Shahu, capacidade 30).

---

## Decisões de produto tomadas (modo autônomo, 06/07/2026)

Autorizado pelo Rainer: "Execute tudo o que puder você mesmo (...) 100% autônomo".
Cada decisão segue a recomendação da auditoria de fim de semana (`weekend/REVIEW.md`).
**Reverter qualquer uma é barato — falar comigo que eu desfaço.**

| # | Decisão | Escolha | Racional |
|---|---|---|---|
| D1 (C2) | O que o dono da inscrição pode mudar sozinho | Só `status → cancelada`, `brings_food`, `notes`; `tier_id` apenas enquanto não houver pagamento pago. Todo o resto bloqueado por trigger. | Proposta literal da auditoria; staff e service_role não são afetados. |
| D2 (C1/C2) | Trocar de cerimônia | Proibido editar `ceremony_id` (qualquer ator com JWT). Trocar = cancelar + reinscrever. | Fecha a família de bugs do C1 na raiz; fluxo de reinscrição já suportado (B6). |
| D3 (M7) | Fonte única dos tiers | Tabela `contribution_tiers` (reais) permanece a fonte. Coluna jsonb `ceremonies.contribution_tiers` e `registrations.chosen_contribution` (v10) marcadas DEPRECATED via COMMENT — **sem drop** (remoção física fica para revisão explícita). | App + Edge Function já usam a tabela; `payments.amount` preserva o histórico. Drop autônomo de coluna seria improviso de schema. |
| D4 (M1) | Staff-read de anamnese (LGPD) | Limitado a inscrições com `status <> 'cancelada'` (tabela e storage). | Minimização LGPD art. 11; filtro por idade da cerimônia fica para revisão futura. |
| D5 (M6) | Avatar de condutor | Escrita só `org_admin` (alinha com a tabela `conductors` v06). Teste b1 atualizado. | O comentário da v07 já prometia isso; a tabela já exigia. |
| D6 (M2) | Trilha de auditoria LGPD | RPC `log_anamnese_view()` SECURITY DEFINER grava em `audit_log`; console chama antes de abrir ficha. | Acesso a dado de saúde precisa deixar rastro antes da Kao operar. |
| D7 (A5) | Listagem do bucket público | Policy ampla de SELECT de `ceremony-images` restrita (público não lista; URL pública continua funcionando; staff lista o que é da org). | Advisor 0025; app não usa `.list()` em lugar nenhum (verificado por grep). |
| D8 | `simulate_payment` | DROP em produção (v13). App não a usa (grep confirma); teste manual passa a ser via Edge Function mock. | Furo real: participante se auto-pagava. |
| D9 (M3) | `on_anamnese_change` | Alinhar filtro com `refresh_registration_status` (incluir `pendente`/`aguardando_pagamento`). | Inconsistência apontada na auditoria. |

## Ações que SÓ o Rainer pode fazer (painel/config — fora do meu alcance)

- [ ] **Repo GitHub → privado** (está público com relatórios de vulnerabilidade!). Settings → General → Danger Zone.
- [ ] **Supabase Auth → Templates → "Confirm signup"**: incluir `{{ .Token }}` (fallback do código de 6 dígitos).
- [ ] **Supabase Auth**: decidir/desligar login por magic link/OTP (hoje o servidor ainda aceita — bypassa o CPF).
- [ ] **Leaked Password Protection**: manter DESLIGADA (decisão consciente — CPF como senha esbarraria no HaveIBeenPwned).
- [ ] **CPF do usuário `rainer@academiarafaeltoro.com.br`** (segue sem senha/CPF; preciso do CPF para fazer o backfill como fiz com rainerdev).
- [ ] **Credenciais do provedor PIX** (Asaas/MercadoPago — falar com Bruno). Sem elas o PIX roda em modo mock.

---

## Checklist de execução

### Fase 1 — Blindagem (v13) no banco — ✅ CONCLUÍDA (06/07)
- [x] v13 escrita (`db/hauxe_schema_patch_v13_security_hardening.sql`): guard de INSERT/UPDATE do dono (D1/D2), drop `simulate_payment` (D8), M3 (D9), M1 (D4), M6 (D5), A5 (D7), RPC `log_anamnese_view` (D6), COMMENTs de deprecação (D3)
- [x] Testes: suite `08_registration_write_guard.sql` (12 casos) + b1/b1b/b2/b3/b4/b5 (02) + c6 (03) + `run_all.sql` → **48/48 PASS** no Postgres 16 local (cadeia v01→v13 limpa, v13 idempotente)
- [x] v13 APLICADA em produção (migration `hauxe_schema_patch_v13_security_hardening`) + sondas vivas com rollback: participante puro NÃO se auto-confirma/check-in/troca cerimônia (42501); brings_food/notes/cancelar OK; staff (org_admin) segue livre
- [x] Advisors pós-migration: WARN de listagem do bucket eliminado; 2 WARNs de simulate_payment eliminados; +1 WARN intencional novo (`log_anamnese_view`, valida staff internamente). Residuais intencionais inalterados.

### Fase 2 — Inscrição do participante (app) — ✅ CONCLUÍDA (06/07)
- [x] Hook `useAvailableCeremonies` + `useEnroll` (INSERT `status='reservada'`; reinscrição = UPDATE de cancelada; `ceremony_full` tratado)
- [x] Tela `(app)/cerimonia/[id].tsx` (detalhe + "Garantir minha vaga") com estados: lotada / não encontrada / erro
- [x] Hub estado "sem inscrição" lista cerimônias publicadas futuras
- [x] `tsc --noEmit` limpo

### Fase 3 — Edge Functions deployadas (modo mock) — ✅ CONCLUÍDA (06/07)
- [x] `create-pix-charge` deployada (verify_jwt on, v1 ACTIVE)
- [x] `pix-webhook` deployada (verify_jwt off, v1 ACTIVE) — **endurecida para fail-closed**: sem PIX_WEBHOOK_SECRET rejeita tudo (verificado vivo: POST sem assinatura → 401)
- [x] Confirmação mock documentada no README (SQL privilegiado; simulate_payment não existe mais)

### Fase 4 — Console da Kao Fase 2 — ✅ CONCLUÍDA (06/07)
- [x] Hook `useOrgRegistrations` (inscritos da próxima cerimônia + progresso via registration_progress; staff RLS já cobria payments/profiles)
- [x] Tela `/admin/inscritos` (lista com chips Ficha/PIX, resumo de vagas, canceladas separadas)
- [x] Detalhe `/admin/inscritos/[id]`: contato, inscrição, ficha completa — `log_anamnese_view` SEMPRE antes de ler (trilha LGPD; nota 🔒 na UI) + botão check-in
- [x] Card "Inscritos" no dashboard do console; `tsc --noEmit` limpo

### Fase 5 — Fechamento — ✅ CONCLUÍDA (06/07)
- [x] Removido `app/(admin)/` (duplicata morta; console real é `app/admin/`; nada referenciava)
- [x] Fontes: JÁ estavam carregadas via useFonts no app/_layout (CLAUDE.md estava desatualizado — nada a fazer)
- [x] CLAUDE.md atualizado (v13, storage reconciliado, tiers fonte única, functions deployadas, 48/48)
- [x] CI GitHub Actions (.github/workflows/ci.yml: pnpm + typecheck + expo export) — push aceito
- [x] `expo export -p web` com 0 erros (18 rotas; exige .env — Metro faz cache do inline: rebuild com -c ao trocar env!)

### Verificação fim-a-fim (e2e real contra PRODUÇÃO) — ✅ 11/11 PASS (06/07)
Playwright dirigindo o build web servido localmente, backend = Supabase real
(ponte de rede: Chromium não atravessa o agent proxy do ambiente; chamadas ao
Supabase interceptadas via page.route → request context do Playwright):
1. Login e-mail+CPF (rainerdev + CPF real setado hoje) → hub ✓
2. Hub mostra a cerimônia real (Paka Shahu) e inscrição confirmada ✓
3. Console da Kao (guard staff) + card Inscritos ✓
4. /admin/inscritos: lista com chips Ficha/PIX + resumo de vagas ✓
5. Ficha do inscrito abre com dados de saúde + nota de trilha LGPD ✓
6. **audit_log conferido no banco**: view_anamnese gravado no momento do clique ✓

---

## Log de checkpoints (atualizar a cada push)

| Quando | O quê | Commit |
|---|---|---|
| 06/07 | Review completa + decisões D1–D9 + este arquivo | `699685a` |
| 06/07 | Fase 1: v13 (C2 fechado!) escrita, testada 48/48 e APLICADA em produção | `4aad2ba` |
| 06/07 | Fase 2: fluxo de inscrição do participante (cerimonia/[id] + hub) | `8de2089` |
| 06/07 | Fase 3: Edge Functions deployadas (mock) + webhook fail-closed | `c0cf496` |
| 06/07 | Fase 4: Console da Kao — inscritos, fichas (trilha LGPD) e check-in | `c14882e` |
| 06/07 | Fase 5: limpeza + CLAUDE.md + CI | `4ee8430`, `6e03624` |
| 06/07 | E2E 11/11 PASS contra produção (login→hub→console→ficha→audit_log) | (este commit) |

## Estado ao fim de 06/07 — ETAPA TECNICAMENTE FECHADA 🎉
Falta apenas o que depende de humanos: as ações de painel listadas acima e as
credenciais do provedor PIX (o fluxo roda em mock até lá). Próxima fronteira
de produto: criação de cerimônia no console (Fase 3b) e integração PIX real.
