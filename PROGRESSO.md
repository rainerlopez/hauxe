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

### Fase 1 — Blindagem (v13) no banco
- [ ] v13 escrita (`db/hauxe_schema_patch_v13_security_hardening.sql`): guard de UPDATE do dono (D1/D2), drop `simulate_payment` (D8), M3 (D9), M1 (D4), M6 (D5), A5 (D7), RPC `log_anamnese_view` (D6), COMMENTs de deprecação (D3)
- [ ] Testes: suite `08_owner_update_guard.sql` + ajuste do b1 (02_storage) + `run_all.sql`
- [ ] v13 APLICADA em produção + verificada (probes com ROLLBACK)
- [ ] Advisors re-checados pós-migration

### Fase 2 — Inscrição do participante (app)
- [ ] Hook `useAvailableCeremonies` + `useEnroll` (INSERT `status='reservada'`; reinscrição = UPDATE de cancelada)
- [ ] Tela `(app)/cerimonia/[id].tsx` (detalhe + "Garantir minha vaga") com estados: lotada / já inscrito / erro
- [ ] Hub estado "sem inscrição" lista cerimônias publicadas
- [ ] `tsc --noEmit` limpo

### Fase 3 — Edge Functions deployadas (modo mock)
- [ ] `create-pix-charge` deployada (verify_jwt on)
- [ ] `pix-webhook` deployada (verify_jwt off)
- [ ] Fluxo PIX mock verificado contra produção

### Fase 4 — Console da Kao Fase 2
- [ ] Hook `useOrgRegistrations` (inscritos da cerimônia + progresso)
- [ ] Tela `/admin/inscritos` (lista com chips vaga/ficha/pagamento)
- [ ] Detalhe da ficha (chama `log_anamnese_view` antes de ler) + check-in
- [ ] `tsc --noEmit` limpo

### Fase 5 — Fechamento
- [ ] Remover `app/(admin)/` (duplicata morta; console real é `app/admin/`)
- [ ] Fontes via expo-font (Schibsted Grotesk + Fraunces)
- [ ] CLAUDE.md atualizado (storage já reconciliado, v13, novos fluxos)
- [ ] CI GitHub Actions (tsc + expo export) — pode falhar por permissão de workflow; se falhar, documentar
- [ ] `expo export -p web` com 0 erros

---

## Log de checkpoints (atualizar a cada push)

| Quando | O quê | Commit |
|---|---|---|
| 06/07 | Review completa + decisões D1–D9 + este arquivo | (este commit) |
