# Briefing de segunda — auditoria de fim de semana (Hauxe)

**Período:** 04–05/07/2026 · **Autor:** agente autônomo de fim de semana
**Branches entregues:** `claude/weekend-review` (relatórios/memória) e
`claude/weekend-integration` (migration `v11` + testes).
**Regras honradas:** push só em `claude/*`; **zero** acesso ao Supabase de
produção; **nenhum** PR mergeado; **nenhuma** UI criada/editada.

---

## 1. TL;DR (leia isto primeiro)

1. **Fiz uma auditoria de segurança do banco** (PRs #4/#5/#6 + v10, todos já na
   `main`) e rodei os testes num Postgres local. Achei **2 críticos, 3 altos, 7
   médios, 7 baixos** (`weekend/REVIEW.md`).
2. **Corrigi o que dava para corrigir sem decisão de produto** na migration
   **`v11`** (branch `claude/weekend-integration`): fechei o **bypass de
   capacidade (C1)** e a **irreprodutibilidade das policies de storage (A1)**,
   com teste de regressão. Suíte **29/29 PASS**.
3. **A ação mais importante para vocês:** **C1 é um bug que existe HOJE em
   produção** — um participante consegue furar a capacidade de uma cerimônia
   lotada. A `v11` corrige. Recomendo priorizar (ver §4).
4. **4 itens dependem de decisão de VOCÊS** e eu **não** toquei: C2, M1, M6, A3
   (§3). Precisam de definição de produto antes de virar código.

---

## 2. O que foi feito (tarefas 1–5)

| # | Tarefa | Entrega |
|---|---|---|
| 1 | Revisão profunda de segurança | `weekend/REVIEW.md` (achados por severidade, arquivo+linha) |
| 2 | Branch de integração | `claude/weekend-integration` (partindo da `main`; #4–#7 já estavam mergeados) — `weekend/INTEGRATION.md` |
| 3 | Suíte de testes em Postgres local | `weekend/TEST-RESULTS.md` (mock do Supabase + cadeia v01→v10 + 28 casos + sondas) |
| 4 | Correções + regressão | `db/hauxe_schema_patch_v11_security_fixes.sql` + caso d5 + fix M4 → suíte **29/29** |
| 5 | Roteiro de teste manual integrado | `weekend/ROTEIRO-TESTE.md` (Postgres local/staging, guarda anti-produção) |

Tarefa 6 = este documento. Tarefa 7 = auto-revisão final (próxima execução).

---

## 3. Achados críticos e o que fiz com cada um

### ✅ CORRIGIDOS na `v11` (sem depender de decisão de produto)

**C1 · Bypass de capacidade via troca de `ceremony_id`** *(crítico)*
- **Existe em produção hoje.** O trigger `check_ceremony_capacity` (v09) só
  olhava `OLD.status` no early-return de UPDATE. Um participante autenticado,
  via a policy owner (`FOR ALL`), faz `UPDATE registrations SET ceremony_id =
  '<cerimônia lotada>'` mantendo status ocupante e **fura a vaga** — reproduzi:
  cap=1 terminando com 2 ocupantes.
- **Fix (F2):** early-return passa a exigir `OLD.ceremony_id = NEW.ceremony_id`.
  Coberto pelo caso de regressão **d5**. Sonda P1 → `PROTEGIDO`.

**A1 · Cadeia de migrations não reproduzível (policies órfãs da v03)** *(alto)*
- A v03 criou policies de storage com nomes **sem hífen** e cast `::uuid`
  inseguro. A v05/v07/v08 corrigiram só os nomes **com hífen** (os que existiam
  na produção). Num banco criado **do repo**, os nomes órfãos sobrevivem e
  estouram `22P02` em uploads de avatar (`conductors/…`) — quebra qualquer
  ambiente novo/staging.
- **Nuance importante:** em **produção** esses nomes órfãos **não existem** (lá
  as policies foram criadas com os nomes hifenizados, já seguros). Então A1 **não
  é um bug de produção** — é um bug de **reprodutibilidade** (o repo diverge da
  produção; todo ambiente novo nasce quebrado). A `v11` (F1) dropa os nomes
  órfãos com `DROP IF EXISTS` — **inócuo em produção**, corrige o repo. Sonda P3
  → `PROTEGIDO`.

**M4 · `run_all.sql` com `\i` relativo ao cwd** *(médio)* — trocado por `\ir`;
a suíte roda de qualquer diretório.

### ⏸️ NÃO corrigidos — dependem de decisão de VOCÊS

> Eu **não** improviso schema/regra de produto. Estes ficam para conversa de
> segunda; cada um tem uma pergunta objetiva.

**C2 · Dono da inscrição pode se auto-promover a `confirmada`/`check_in`**
*(crítico, pré-existente)*
- A policy `registrations - owner` é `FOR ALL` sem restrição de coluna. O dono
  pode `UPDATE … SET status='confirmada'` **sem pagar e sem ficha** (reproduzi:
  sonda P2 → `VULNERAVEL`), e ainda mexer em `tier_id`, `chosen_contribution`,
  `ceremony_id`. O trigger de status só corrige num próximo evento; `check_in`
  nunca é revertido.
- **❓ Decisão necessária:** quais transições o participante PODE fazer sozinho?
  (provavelmente só: `→ cancelada`, editar `brings_food`/`notes`, e
  `chosen_contribution` **enquanto não pago**). Com a resposta, implemento um
  trigger `BEFORE UPDATE` que restringe as demais colunas quando o ator não é
  staff/service_role. **É o item de segurança mais sério ainda aberto.**

**M1 · Staff lê anamnese sem filtro de status/expiração** *(médio, LGPD)*
- Inscrição `cancelada` ou cerimônia antiga mantém a staff com acesso perpétuo à
  ficha de saúde e anexos.
- **❓ Decisão:** limitar o staff-read a inscrições ativas (`status <>
  'cancelada'`) e/ou a cerimônias recentes? (minimização, LGPD art. 11).

**M6 · Policy de avatar: qualquer membro × só org_admin** *(médio)*
- As policies de avatar (v07) usam `is_org_member()` (qualquer membro, inclusive
  condutor), mas a tabela `conductors` exige org_admin para escrita. O teste b1
  consagra o comportamento mais permissivo.
- **❓ Decisão:** condutor pode subir o próprio avatar, ou só org_admin? Alinho
  policy+comentário+teste conforme a resposta.

**A3 · `chosen_contribution` sem validação server-side** *(alto, latente)*
- Hoje a Edge Function PIX é mock. Na integração real, o valor da cobrança **não
  pode** confiar no campo gravado pelo cliente (o dono pode gravar 1 centavo).
- **❓ Decisão/lembrete:** na integração Asaas/MercadoPago, a Edge Function deve
  **derivar/validar** o valor a partir dos tiers no servidor. Não é fix de banco;
  é requisito da fase PIX.

*(Os 7 médios e 7 baixos completos estão em `weekend/REVIEW.md`; os demais são
robustez de teste, convenções e documentação — sem urgência.)*

---

## 4. Ordem de merge recomendada para segunda

**Contexto:** os PRs #4–#7 **já estão na `main`** (`064ac0a`). O único trabalho
**novo** é a `v11` + ajustes de teste na `claude/weekend-integration`.

**Passo a passo sugerido (vocês executam — eu não mergeio nada):**

1. **Revisar a `v11`** em `claude/weekend-integration`
   (`db/hauxe_schema_patch_v11_security_fixes.sql`, commits `e6643c5` +
   `2d21679`). É pequena e comentada.
2. **Rodar o roteiro** `weekend/ROTEIRO-TESTE.md` (trilha A, Postgres local) para
   confirmar 29/29 e as sondas P1/P3 `PROTEGIDO`.
3. **Abrir PR** `claude/weekend-integration → main` com a `v11` (título sugerido:
   *"v11 · fix bypass de capacidade (C1) + reconciliação de storage policies
   (A1)"*). **Priorizar por causa de C1 (bug de produção).**
4. **Aplicar a `v11` no Supabase de produção** como migration. É segura: F1 é
   `DROP IF EXISTS` (no-op em prod) e F2 é `CREATE OR REPLACE` do trigger. Fecha
   C1 em produção.
5. **Agendar a decisão de produto** sobre **C2** (o mais urgente dos abertos) e,
   em seguida, M1/M6/A3. Com as respostas, eu preparo a `v12`.

> **Não** recomendo mexer em C2 antes do alinhamento — a restrição errada pode
> quebrar fluxos legítimos do participante (ex.: cancelar, escolher
> contribuição). Melhor 15 min de conversa do que adivinhar.

---

## 5. Dúvidas acumuladas (checklist para a conversa)

- [ ] **C2:** quais transições/colunas o dono da inscrição pode alterar sozinho?
- [ ] **M1:** staff-read de anamnese deve filtrar por status/idade da inscrição?
- [ ] **M6:** avatar de condutor — qualquer membro ou só org_admin?
- [ ] **A3:** confirmar que a Edge Function PIX vai validar o valor no servidor.
- [ ] **Processo:** houve **duas execuções minhas em paralelo** na tarefa 3
      (mesmo commit-base), com resultados diferentes que reconciliei. Vale checar
      o agendamento para não disparar execuções concorrentes na mesma branch de
      memória (detalhe em `weekend/PLAN.md`, nota de reconciliação).

---

## 6. Ponteiros

| Documento | Conteúdo |
|---|---|
| `weekend/REVIEW.md` | Todos os achados por severidade, com arquivo+linha |
| `weekend/INTEGRATION.md` | Como a branch de integração foi montada |
| `weekend/TEST-RESULTS.md` | Suíte 28→29 casos, sondas, reconciliação, seção da v11 |
| `weekend/ROTEIRO-TESTE.md` | Roteiro manual do estado integrado (local/staging) |
| `weekend/sql/` | `00_supabase_mock.sql` + `99_probes.sql` (reprodução local) |
| `db/hauxe_schema_patch_v11_security_fixes.sql` | Os fixes F1+F2 (branch `claude/weekend-integration`) |
