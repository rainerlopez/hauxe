# Relatório de análise — estado real do projeto Hauxe

**Data:** 2026-07-19 · **Base:** leitura direta do código na `main` (commit `2377d7b`, pós-merge PR #10) + docs `weekend/` e `ENTREGA-user-auth.md`.
**Atualização (mesma data, conector Supabase autorizado):** banco remoto VERIFICADO ao vivo — ver §0.

---

## 0. Verificação ao vivo do Supabase + RETIFICAÇÃO

> **Retificação:** versão anterior deste relatório afirmou "banco de produção vazio". FALSO ALARME — o projeto estava em restauração (pause do free tier; painel mostrou "Restoration complete" às 10:34). Leituras feitas durante o boot retornaram schemas vazios. Releitura pós-restore confirma banco ÍNTEGRO.

**Estado real do projeto `hauxe` (`xgjnsyffibdahymaropx`, sa-east-1, Postgres 17.6):**
- 13 tabelas + view `registration_progress`, 39 policies (28 public + 11 storage), 2 buckets, 0 policies órfãs da v03
- Dados: 1 org, 1 cerimônia, 1 inscrição, 1 anamnese, 2 usuários
- 20 migrations registradas em `supabase_migrations` — cadeia v01→v13
- Edge Functions ACTIVE: `create-pix-charge` (verify_jwt on), `pix-webhook` (verify_jwt off), deploy 06/07
- v11 (fix capacidade) e v12 (CPF) confirmadas aplicadas

**ACHADO PRINCIPAL — `main` está DEFASADA; trabalho de 06/07 vive em branch não mergeado:**

Branch `claude/supabase-user-cpf-update-rlk691` (5 commits à frente da `main`, +1998/−221 linhas) contém:
1. `db/hauxe_schema_patch_v13_security_hardening.sql` — **APLICADA em produção** (migration 20260706190730). Fecha: **C2** (trigger `trg_registration_write_guard`: dono só cancela/reinscreve/edita brings_food/notes/tier não-pago; `ceremony_id` imutável), **M1** (staff-read de anamnese só inscrições ativas), **M6** (avatar só org_admin), **M2** (RPC `log_anamnese_view` grava `audit_log` — trilha LGPD), **A5** (ceremony-images sem leitura pública), **D8** (DROP `simulate_payment`), M3, e deprecia colunas v10.
2. **Fluxo de inscrição do participante** (`useAvailableCeremonies`, `useEnroll`, `(app)/cerimonia/[id].tsx`) — fecha o gap "nenhum INSERT em registrations".
3. **Console da Kao Fase 2** (`admin/inscritos/` — lista, ficha, check-in).
4. Remoção do código morto `app/(admin)/` + CLAUDE.md atualizado.
5. **CI GitHub Actions** (`.github/workflows/ci.yml` — typecheck + expo export web).
6. Webhook PIX **fail-closed** + suíte de testes ampliada (caso 08, guard de escrita).
7. `PROGRESSO.md` com decisões D1–D9 e "e2e 11/11 contra produção".

**Consequência:** a maioria dos gaps dos §§1–5 abaixo (analisados sobre a `main`) já está resolvida nesse branch. **Ação nº 1 do projeto: revisar e mergear `claude/supabase-user-cpf-update-rlk691` na `main`.** Produção já roda o schema v13 correspondente.

**Divergências residuais confirmadas ao vivo:**
- `simulate_payment` NÃO existe mais em produção (dropada pela v13) — docs/CLAUDE.md da `main` desatualizados.
- `snapshot_anamnese_revision`/`trg_anamnese_revision` existem em produção (migrations 20260603173303) mas o SQL não está versionado em `db/` de NENHUM branch — único drift real remanescente (recuperável: conteúdo está em `supabase_migrations.schema_migrations`).
- Advisors de segurança: 10 WARNs — 9 são helpers SECURITY DEFINER expostos (maioria intencional/documentada; `log_anamnese_view` é por design) + **"Leaked Password Protection Disabled"**: relevante pois senha = CPF (11 dígitos numéricos); avaliar habilitar/estratégia.

---

## 1. TL;DR

1. **Fluxo principal quebrado no cliente:** nenhum código do app cria linha em `registrations`. Após cadastro, hub sempre mostra "Você ainda não tem inscrição". Não existe tela de escolha de cerimônia. Cadastro (`sign-up.tsx:70,73`) exibe cerimônia **hardcoded** ("Cerimônia Yawanawá com Paka Shahu · 31/05"), não vinda do banco.
2. **C2 aberto (crítico, produção):** policy `registrations - owner` é `FOR ALL` sem restrição de coluna (`db/hauxe_schema.sql:382-383`). Dono se auto-promove a `confirmada`/`check_in` sem pagar nem preencher ficha. Reproduzido (sonda P2 → `VULNERAVEL`). Aguarda decisão de produto desde o weekend-review.
3. **Drift repo ↔ produção:** `simulate_payment` e `snapshot_anamnese_revision`/`trg_anamnese_revision` citados em CLAUDE.md e `docs/architecture-db.md` **não existem em nenhum SQL do repo**. Aplicados direto em produção, nunca versionados. Repo não reconstrói o banco real.
4. **CLAUDE.md desatualizado:** storage policies marcadas "PENDENTE" já foram corrigidas (v05→v07→v08→v11, todas no repo). Referencia `(admin)/index.tsx`, que virou código morto.
5. **PIX 100% mock.** `create-pix-charge` com `PIX_PROVIDER` setado **lança erro** ("não implementado"). Webhook sem HMAC: sem `PIX_WEBHOOK_SECRET`, aceita qualquer POST; com secret, comparação de string simples.
6. Base sólida no resto: RLS consistente, capacidade robusta (v11), suíte 33 casos, tsc limpo, tema/design system usado consistentemente, hooks com padrão de fases uniforme.

---

## 2. Fluxos — passo a passo real (código)

### 2.1 Autenticação (e-mail = login, CPF = senha)
1. **Cadastro** `(auth)/sign-up.tsx`: valida nome ≥2, e-mail (regex), CPF (dígitos verificadores módulo 11, `src/features/auth/cpf.ts:27-42` — validação só no cliente; banco checa apenas 11 dígitos).
2. `signUp()` → `supabase.auth.signUp({ email, password: sanitizeCpf(cpf), data: { full_name, cpf } })` (`AuthContext.tsx:87-101`).
3. Trigger `handle_new_user()` (v12) cria `profiles` + grava `cpf` normalizado dos metadados.
4. Sessão nula (confirmação de e-mail ativa) → `/check-email`. Opções: link do e-mail → `/callback` (troca `?code=` PKCE via `exchangeCodeForSession`, guard `useRef` contra double-fire) OU código 6 dígitos → `/verify` (`verifyOtp type:'signup'`).
5. **Login** `(auth)/sign-in.tsx`: `signInWithPassword({ email, password: cpf })`. Erros Supabase mapeados p/ PT-BR por string-matching (frágil).
6. Guard global `useProtectedRoute` (`app/_layout.tsx:28-42`): sem sessão → `/sign-in`; com sessão em `(auth)` → `/`.

### 2.2 Inscrição / Hub `(app)/index.tsx`
1. `useRegistration` busca inscrição ativa (`status != 'cancelada'`, mais recente) + join `ceremonies`.
2. Progresso vem da view `registration_progress` (banco, v02): `vaga_ok` (status ≠ cancelada/lista_espera), `ficha_ok` (anamnese com consentimento), `pagamento_ok` (payment `pago`).
3. Revalida no foco (`useFocusEffect`) — volta de anamnese/contribuição atualiza cards.
4. Cards de tarefa navegam p/ `/anamnese` e `/contribuicao` (rotas `href:null`, não viram aba).
5. **GAP:** passo 0 (criar a inscrição) não existe. Único SELECT em `useRegistration.ts:57`; nenhum INSERT no app inteiro.
6. UX: `none` e `error` tratados igual — usuário não distingue "sem inscrição" de erro de rede (`index.tsx:126`).

### 2.3 Anamnese `(app)/anamnese.tsx`
1. Form: contato de emergência, medicação/psiquiátrico/cardíaco (+detalhes condicionais), gestante, alergias, condições, experiência prévia, consentimento LGPD obrigatório.
2. `useAnamnese.save()` → **upsert** `onConflict: 'profile_id'` (1 ficha global por pessoa). `consent_at` carimbado só na transição p/ consentido.
3. Trigger `trg_anamnese_status_sync` (banco) reavalia TODAS inscrições `reservada`/`confirmada` da pessoa (anamnese é global, multi-org).
4. Sucesso → `router.back()` → hub revalida.

### 2.4 Pagamento `(app)/contribuicao.tsx`
1. `useContributionTiers` lista tiers por cerimônia.
2. Escolha do tier → `usePayment.createCharge()` invoca Edge Function `create-pix-charge`.
3. Function: valida ownership sob RLS do usuário → busca amount pelo `tier_id` **sem checar se tier pertence à cerimônia** (risco A3) → idempotência (reusa payment `pendente`) → mock do provedor (txid `mock-…`, QR via api.qrserver.com) → INSERT `payments` via service_role → grava `tier_id` na inscrição.
4. UI mostra QR + copia-e-cola (`expo-clipboard`); **polling 5s** até `status='pago'`.
5. Confirmação real viria do `pix-webhook`: `UPDATE payments SET status` por `provider_txid` → dispara `trg_payment_status_sync`.

### 2.5 Confirmação automática (banco, v02)
- `refresh_registration_status()`: ignora estados terminais (`cancelada`/`lista_espera`/`check_in`); `ficha_ok AND pagamento_ok` → `confirmada`; senão → `reservada` (inclusive rebaixa `confirmada` se pagamento estornar).
- Disparo: AFTER INSERT/UPDATE em `payments.status` e `anamneses.consent_health_data`.
- Capacidade: `check_ceremony_capacity` (v09+v11) com lock `FOR UPDATE`; bypass por troca de `ceremony_id` fechado na v11 (regressão d5).

### 2.6 Console staff `/admin`
1. `useStaffAccess`: consulta `org_members` do usuário; trata corrida de deep-link (não decide `denied` enquanto auth carrega). Guard duplo: UX no layout + RLS no banco.
2. `admin/index.tsx`: saudação, papel, card "Condutores".
3. `admin/condutores/`: CRUD completo — listagem com filtros ativos/inativos, form cria/edita (`[id].tsx` com `id==='novo'` como convenção mágica), avatar com crop 512×512 + upload `ceremony-images/conductors/{org_id}/{id}.jpg` + cache-busting, ativar/desativar com confirmação.
4. **Código morto:** `app/(admin)/` inteiro (grupo renomeado p/ `admin/` no commit `60a3a4c`, arquivos antigos não deletados; versão desatualizada da tela).

---

## 3. O que EXISTE × o que FALTA

| Área | Existe | Falta |
|---|---|---|
| Auth e-mail+CPF | Completo, validado (12/12 Playwright na entrega) | Migração de usuários antigos sem senha; template de e-mail; desligar magic link server-side (§5 ENTREGA); unicidade de CPF; backfill |
| Criação de inscrição | **Nada no cliente** | Tela de cerimônias + INSERT em `registrations`; cerimônia dinâmica no sign-up |
| Hub/progresso | Completo, revalida no foco | Distinguir erro de "sem inscrição" |
| Anamnese | Completo (form, LGPD, upsert, trigger) | Criptografia campos sensíveis (pgsodium/Vault — comentário no schema, nunca feito); upload de anexos (bucket `anamnese-files` sem UI) |
| Pagamento | UI + mock fim-a-fim | Provedor real Asaas/MP; HMAC no webhook; validação server-side de tier/valor (A3); deploy + secrets + URL webhook |
| Console staff | Guard + CRUD condutores | Fase 2: lista de inscritos + fichas (aguardava OK); CRUD cerimônias/tiers |
| Banco | 13 tabelas, RLS, capacidade, triggers, v02–v12 | Fix C2; decisões M1/M6; versionar `simulate_payment` + `snapshot_anamnese_revision` (drift) |
| Auditoria LGPD | Tabelas `audit_log`/`anamnese_revisions` existem | `audit_log` sem NENHUM gravador; trigger de revisions só em produção, fora do git |
| Testes | 33 casos SQL + mock Supabase local | CI (GitHub Actions); testes de frontend (zero; `playwright` em devDeps sem specs) |
| Design system | Tema completo, fontes carregadas, dark mode | `motion.ts` nunca importado (reanimated instalado, zero animações); toggle manual de tema; 1 cor hardcoded (`index.tsx:39`); alias `@/*` configurado e nunca usado |

---

## 4. Riscos priorizados

1. **C2** (crítico, produção): restringir colunas/transições do dono de `registrations` — trigger BEFORE UPDATE. Bloqueado por decisão: quais transições o participante pode fazer? (provável: `→cancelada`, `brings_food`/`notes`, `chosen_contribution` enquanto não pago).
2. **Gap de inscrição** (alto, produto): sem ele, app não cumpre o fluxo "vaga garantida na inscrição".
3. **Drift de schema** (alto, processo): exportar de produção e versionar `simulate_payment` + `snapshot_anamnese_revision` + `trg_anamnese_revision`.
4. **A3** (alto, latente): Edge Function deve derivar/validar valor no servidor na integração real.
5. **Webhook sem HMAC** (alto quando PIX real entrar).
6. **M1** (LGPD): staff-read perpétuo de anamnese (inscrições canceladas/antigas). **M6:** avatar gravável por qualquer membro vs. tabela exige org_admin.
7. **Docs:** atualizar CLAUDE.md (storage já reconciliado; rotas admin; drift) — evita retrabalho.

---

## 5. Sugestão de ordem de ataque (REVISADA pós-verificação ao vivo)

Itens 1, 2, 3, 5 e 6 da lista original **já estão prontos** no branch `claude/supabase-user-cpf-update-rlk691` (v13 aplicada em produção). Ordem atual:

1. **Mergear `claude/supabase-user-cpf-update-rlk691` → `main`** (revisar PR; é o passo que sincroniza repo com produção).
2. Versionar `snapshot_anamnese_revision`/`trg_anamnese_revision` em `db/` (conteúdo recuperável de `supabase_migrations`).
3. Integração PIX real (Asaas/MP): HMAC no webhook + validação de valor server-side (A3) + secrets + URL.
4. Cerimônia hardcoded no sign-up → dinâmica (verificar se o branch novo já cobre).
5. Avaliar "Leaked Password Protection" (senha = CPF) + migração de usuários pré-senha.
6. LGPD produção: criptografia de campos sensíveis (pgsodium/Vault) — ainda pendente em todos os branches.
7. Menores: `motion.ts` sem uso, alias `@/*`, distinção erro×sem-inscrição no hub.
