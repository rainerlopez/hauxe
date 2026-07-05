# Resultados de teste — suíte de 28 casos sobre a cadeia integrada

**Data:** 2026-07-05 (exec 3 do agente de fim de semana)
**Base testada:** `claude/weekend-integration` (idêntica à `main` 064ac0a) — migrations `db/hauxe_schema.sql` + patches v02→v10.
**Ambiente:** Postgres **local** no sandbox (PostgreSQL 16.13), banco `hauxe_test`. **Nenhum acesso à produção** (regra 2 respeitada).

---

## Resumo executivo

| Métrica | Valor |
|---|---|
| Casos totais | **28** (7+4+5+5+4+3) |
| PASS na cadeia do repo (v01→v10, banco limpo) | **24** |
| FAIL na cadeia do repo | **4** (suíte 02 inteira) |
| Causa-raiz dos 4 FAIL | **A1** do `REVIEW.md` — policies obsoletas da v03 sobrevivem à cadeia |
| PASS após dropar as policies obsoletas da v03 | **28 / 28** |

**Conclusão:** o Postgres local foi viável e reproduziu **exatamente** o achado A1 previsto na revisão. A suíte não é verde num banco criado do zero a partir do repo — só fica verde depois de remover 4 policies de storage que a cadeia de migrations deixa órfãs (o mesmo bug de `::uuid` que a v07/v08 já tinham corrigido, mas apenas para os nomes de policy que existiam **na produção**, não para os nomes que a v03 **do repo** cria).

---

## Como foi montado o ambiente

O harness pressupõe um projeto Supabase (schemas `auth`/`storage`, roles
`anon`/`authenticated`/`service_role`, `auth.uid()`/`auth.role()`,
`storage.foldername()`). Para rodar em Postgres puro criei um **mock mínimo e
fiel** desse ambiente antes das migrations:

- `scratchpad/00_supabase_mock.sql` (não versionado no repo do produto; descrito
  aqui e reproduzível): roles com os mesmos atributos do Supabase
  (`service_role` com `BYPASSRLS`), `auth.users` com as colunas que os fixtures
  usam, `auth.uid()`/`auth.role()` lendo o GUC `request.jwt.claims` (idêntico ao
  GoTrue/PostgREST), `storage.buckets`/`storage.objects` com RLS ativa,
  `storage.foldername()` com a mesma semântica (segmentos menos o último), e os
  grants padrão que o Supabase concede em `public`/`storage` (a segurança vem da
  RLS, não dos grants).

Sequência aplicada, com `ON_ERROR_STOP=1`, sem um único erro:

```
createdb hauxe_test
psql -f scratchpad/00_supabase_mock.sql          # mock do ambiente Supabase
psql -f db/hauxe_schema.sql                       # v01
psql -f db/hauxe_schema_patch_v02.sql             # v02
… v03 … v10                                        # patches em ordem
```

Todas as migrations aplicaram limpo (só `NOTICE … skipping` de `DROP … IF
EXISTS`, esperado e inócuo). A cadeia **é aplicável de ponta a ponta** num banco
limpo — o problema não é de aplicação, é de **estado final** (ver A1 abaixo).

---

## Resultado por caso

Legenda: **PASS-repo** = resultado na cadeia v01→v10 aplicada num banco limpo do
repo. **PASS-fix** = resultado depois de dropar as 4 policies órfãs da v03
(correção proposta para a tarefa 4).

### Suíte 01 · RLS de conductors (v06) — 7/7 PASS

| Caso | Descrição | Esperado | Obtido | Resultado |
|---|---|---|---|---|
| a1 | membro lê conductor da própria org | 1 | 1 | **PASS** |
| a2 | sem-org não lê conductor | 0 | 0 | **PASS** |
| a3 | org_admin insere na própria org | permitido | permitido | **PASS** |
| a4 | membro não-admin NÃO insere | bloqueado | bloqueado (42501) | **PASS** |
| a5 | admin de outra org NÃO insere em A | bloqueado | bloqueado (42501) | **PASS** |
| a6 | org_admin soft-delete (active=false) | 1 linha | 1 linha | **PASS** |
| a7 | admin de outra org NÃO atualiza A | 0 linhas | 0 linhas | **PASS** |

### Suíte 02 · Storage de avatares de condutores (v07) — 0/4 PASS-repo · 4/4 PASS-fix

| Caso | Descrição | Esperado | PASS-repo | PASS-fix |
|---|---|---|---|---|
| b1 | membro faz upload no path da própria org | permitido | **FAIL** (exceção uuid) | PASS |
| b2 | upload no path de outra org | bloqueado | **FAIL** (txn abortada) | PASS |
| b3 | leitura pública (sem-org lê) | 1 | **FAIL** (txn abortada) | PASS |
| b4 | leitura pública (anon lê) | 1 | **FAIL** (txn abortada) | PASS |

**Erro observado no b1** (que aborta a transação e derruba b2–b4 em cascata):

```
ERROR:  invalid input syntax for type uuid: "conductors"
CONTEXT: INSERT INTO storage.objects … 'conductors/…/avatar.jpg'
```

O INSERT de um avatar (`conductors/{org_id}/avatar.jpg`) dispara a avaliação das
policies de INSERT do bucket `ceremony-images`. Entre elas continua ativa a
**`ceremony-images staff write`** criada pela **v03** (`db/hauxe_schema_patch_v03_storage.sql:31-39`),
cujo predicado faz `(storage.foldername(name))[1]::uuid` — e `'conductors'` não é
UUID → exceção que aborta tudo. A v07 corrigiu esse padrão, mas dropando o nome
**`"ceremony-images - staff faz upload"`** (com hífen, criado ad-hoc na
produção), não o nome **`"ceremony-images staff write"`** que a v03 do repo
usa. As duas coexistem num banco limpo.

### Suíte 03 · Storage anamnese-files staff-read (v08) — 5/5 PASS

| Caso | Descrição | Esperado | Obtido | Resultado |
|---|---|---|---|---|
| c1 | org_admin lê ficha de inscrito da org | 1 | 1 | **PASS** |
| c2 | sem-org NÃO lê ficha | 0 | 0 | **PASS** |
| c3 | dono lê o próprio arquivo | 1 | 1 | **PASS** |
| c4 | dono faz upload do próprio arquivo | permitido | permitido | **PASS** |
| c5 | outro participante NÃO lê ficha alheia | 0 | 0 | **PASS** |

> Observação: a suíte 03 **passa** mesmo com a policy órfã `"anamnese-files staff
> read"` da v03 ativa, porque os fixtures usam paths que **começam com UUID**
> (`{profile_id}/intake.pdf`) — o cast `::uuid` não estoura. O risco da v03 aqui
> é latente (path fora do formato UUID estouraria), não exercido por esta suíte.
> Ainda assim a policy órfã deve ser removida (ver A1 / tarefa 4).

### Suíte 04 · Capacidade (v09) — 5/5 PASS

| Caso | Descrição | Esperado | Obtido | Resultado |
|---|---|---|---|---|
| d1a | 2 inscrições em cap=2 | passam | passam | **PASS** |
| d1b | 3ª inscrição em cap=2 | ceremony_full | ceremony_full | **PASS** |
| d2 | cancelamento libera vaga | P3 entra | P3 entra | **PASS** |
| d3 | capacity NULL = ilimitado | 5 | 5 | **PASS** |
| d4 | UPDATE da própria reg (cheia) não auto-bloqueia | permitido | permitido | **PASS** |

> A suíte 04 **passa**, mas note que ela **não cobre** o cenário do crítico C1
> (UPDATE que troca `ceremony_id` mantendo status ocupante). Ver seção abaixo.

### Suíte 05 · ceremony_conductors mesma-org + RESTRICT (v09/v09b) — 4/4 PASS

| Caso | Descrição | Esperado | Obtido | Resultado |
|---|---|---|---|---|
| e1 | vínculo mesma org (INSERT) | passa | passa | **PASS** |
| e2 | vínculo cross-org (INSERT) | conductor_org_mismatch | conductor_org_mismatch | **PASS** |
| e3 | vínculo cross-org (UPDATE) | conductor_org_mismatch | conductor_org_mismatch | **PASS** |
| e4 | DELETE de conductor vinculado | bloqueado (RESTRICT) | bloqueado (23503) | **PASS** |

### Suíte 06 · Promoção assíncrona de status (MVP) — 3/3 PASS

| Caso | Descrição | Esperado | Obtido | Resultado |
|---|---|---|---|---|
| f0 | baseline (default) | reservada | reservada | **PASS** |
| f1 | só ficha (sem pagamento) → reservada | reservada | reservada | **PASS** |
| f2 | ficha + pagamento → confirmada | confirmada | confirmada | **PASS** |

---

## Verificação extra: C1 (crítico do REVIEW.md) reproduz no banco local

A suíte 04 não cobre C1, então rodei um trace dedicado. Cenário: cerimônia
`CHEIA` com `capacity=1` já ocupada por P1; P3 tem reserva numa cerimônia
`FONTE`. P3 faz `UPDATE registrations SET ceremony_id = '<CHEIA>'` mantendo
`status='reservada'`.

**Resultado:** o UPDATE **passa** e a cerimônia CHEIA (cap=1) fica com **2
ocupantes** — bypass de capacidade confirmado no banco local. O early-return do
trigger (`db/hauxe_schema_patch_v09_ceremony_management.sql:110-112`) só olha
`OLD.status`, não compara `OLD.ceremony_id` com `NEW.ceremony_id`. Correção
proposta já está em C1 do `REVIEW.md` (será aplicada e re-testada na tarefa 4,
junto de um caso de regressão novo na suíte).

---

## Falhas → encaminhamento para a tarefa 4

| # | Falha / achado | Casos afetados | Causa-raiz | Correção candidata (tarefa 4) |
|---|---|---|---|---|
| F1 | Suíte 02 estoura (`invalid input syntax for type uuid`) | b1–b4 | **A1**: policies órfãs da v03 (`ceremony-images staff write/update/delete`) com cast `::uuid` inseguro sobrevivem à cadeia | patch v11: `DROP POLICY IF EXISTS` dos 4 nomes da v03 (`ceremony-images staff write/update/delete` + `anamnese-files staff read`). Idempotente e inócuo em produção (lá esses nomes não existem). Comprovado: após o drop, **28/28 PASS**. |
| F2 | C1 reproduz (bypass de capacidade via troca de `ceremony_id`) | não coberto pela suíte | trigger `check_ceremony_capacity` ignora troca de cerimônia num UPDATE ocupante→ocupante | patch v11: adicionar `AND OLD.ceremony_id = NEW.ceremony_id` ao early-return **+** novo caso na suíte 04 (d5) que exercita o cenário |

> **Não** entram na tarefa 4 (dependem de decisão de produto — registrar no
> MONDAY-BRIEF, **não** corrigir sem aprovação): C2 (auto-promoção do dono da
> inscrição), M1/M6 (escopo LGPD e intenção da policy de avatar). A3
> (`chosen_contribution` server-side) é requisito da integração PIX, não fix de teste.

---

## Prova da correção F1 (executada localmente)

Clonei o banco (`createdb hauxe_test_fix -T hauxe_test`), dropei as 4 policies
órfãs da v03 e re-rodei a suíte inteira:

```
DROP POLICY "ceremony-images staff write"  ON storage.objects;
DROP POLICY "ceremony-images staff update" ON storage.objects;
DROP POLICY "ceremony-images staff delete" ON storage.objects;
DROP POLICY "anamnese-files staff read"    ON storage.objects;
```

Resultado: **suíte 02 → 4/4 PASS**; suítes 01, 03, 04, 05, 06 → **0 FAIL**
(inalteradas). Total **28/28 PASS**. Isso confirma que A1 é a causa-raiz única
dos 4 FAIL e que o drop é a correção correta e suficiente — a ser formalizada
como migration `v11` na `claude/weekend-integration` na tarefa 4.

---

## Limitações e notas de reprodutibilidade

- O mock `00_supabase_mock.sql` reproduz o **comportamento** de `auth`/`storage`
  relevante às policies, não o Supabase inteiro (sem GoTrue real, sem os
  triggers internos de `storage`). Suficiente e fiel para as 6 suítes, que só
  dependem de `auth.uid()`, `auth.role()`, `storage.foldername()` e da RLS.
- Seeds persistentes (`db/tests/seed/*`) **não** foram rodados: referenciam a org
  real de produção por UUID e não fazem parte dos 28 casos (as suítes 01–06 são
  auto-contidas com fixtures sintéticos e `ROLLBACK`). Fora do escopo desta
  tarefa e do banco local.
- Ordem de avaliação de policies do Postgres: no banco local o INSERT de avatar
  estourou de forma **determinística** (a policy insegura da v03 foi avaliada).
  Em produção o incidente descrito na v07 confirma o mesmo efeito. Não se deve
  confiar em ordem de avaliação para "escapar" do cast — a remoção da policy é a
  única correção robusta.

---

## Apêndice · Reconciliação de duas execuções paralelas (2026-07-05)

> **Contexto:** duas execuções do agente de fim de semana partiram do mesmo
> commit da tarefa 2 e rodaram a tarefa 3 de forma independente. Uma observou
> **24/28** (suíte 02 estoura); a outra observou **28/28** (suíte 02 verde). Os
> dois números são **reais** — esta seção explica por quê, e a conclusão
> **fortalece** o encaminhamento de F1, não o contradiz.

**Causa-raiz da divergência — o cast da v03 é avaliado condicionalmente.** A
policy órfã `ceremony-images staff write` (v03) tem o cast dentro de um EXISTS:

```sql
EXISTS (SELECT 1 FROM ceremonies c
        WHERE c.id = (storage.foldername(name))[1]::uuid  -- 'conductors'::uuid
          AND is_org_member(c.org_id))
```

O `'conductors'::uuid` só lança `22P02` **quando é efetivamente avaliado**. Isso
depende do estado/planner:

| Condição no momento do INSERT de avatar | Cast é avaliado? | Suíte 02 |
|---|---|---|
| Tabela `ceremonies` **vazia** e planner adia o cast (não faz constant-folding) | não (EXISTS sobre 0 linhas) | **PASS** |
| Tabela `ceremonies` **com qualquer linha** | sim (por linha) → `22P02` | **FAIL** |
| Planner faz constant-folding de `'conductors'::uuid` no plano | sim (em tempo de plano) → `22P02` | **FAIL** |

A suíte 02 **não semeia `ceremonies`** (`grep -c 'INSERT INTO ceremonies'
02_storage_conductors.sql` = 0). Por isso, num banco **exatamente vazio** de
cerimônias e num planner que adia o cast, a suíte passa (foi o que a execução
"28/28" observou). Reproduzi ambos os lados no mesmo cluster: com a tabela
`ceremonies` vazia o INSERT passa; inserindo **uma** cerimônia antes, o **mesmo**
INSERT estoura com `invalid input syntax for type uuid: "conductors"`.

**Consequência prática (mais grave que "às vezes falha"):** produção **sempre**
tem cerimônias, então em produção a policy da v03 detona de forma
**determinística** em qualquer upload de avatar (`conductors/…`) — foi exatamente
o incidente que a v07 descreve ("bloqueava TODOS os uploads no bucket"). O
"28/28" só acontece num artefato de teste com `ceremonies` vazia; **não** é o
comportamento de um ambiente real. **F1 (drop das policies órfãs da v03)
continua sendo a correção correta e necessária** — e agora com a justificativa
reforçada de que o verde da suíte 02 é frágil (depende de a tabela estar vazia).

**Sondas adicionais desta execução** (`weekend/sql/99_probes.sql`, anexo), todas
reproduzidas no cluster local — reforçam achados da revisão além de C1:

| Sonda | Achado | Resultado |
|---|---|---|
| P2) dono faz `UPDATE registrations SET status='confirmada'` sem ficha/pagamento | **C2** | 🔴 status virou `confirmada` — auto-promoção confirmada |
| P3) staff faz `SELECT` em `anamnese-files` com pasta **não-UUID** | **A1 (vertente anamnese)** | 🔴 `ERRO 22P02` do cast `::uuid` da policy v03 `anamnese-files staff read` — mesma classe do F1, no outro bucket |

P3 é a prova direta de que o drop de `anamnese-files staff read` (já incluído no
F1) é necessário: a suíte 03 passa só porque usa paths UUID válidos; um path fora
do formato estoura a leitura da staff. C2 (P2) **permanece bloqueado por decisão
de produto** — vai para o MONDAY-BRIEF, não é corrigido na tarefa 4.

**Anexos reprodutíveis** (nesta branch de memória): `weekend/sql/00_supabase_mock.sql`
(mock do ambiente Supabase) e `weekend/sql/99_probes.sql` (sondas C1/C2/A1).

---

## Tarefa 4 · Correções aplicadas e re-testadas (exec 4, 2026-07-05)

As falhas/achados acionáveis da tarefa 3 viraram a migration **`v11`** +
ajustes de teste, **commitados na `claude/weekend-integration`** (não na `main`,
não nas branches dos PRs):

| Commit (`claude/weekend-integration`) | Conteúdo |
|---|---|
| `e6643c5` | `db/hauxe_schema_patch_v11_security_fixes.sql` — F1 (drop das 4 policies órfãs da v03) + F2 (guard `OLD.ceremony_id = NEW.ceremony_id` no `check_ceremony_capacity`) |
| `2d21679` | `db/tests/04_capacity.sql` (caso d5, regressão de C1) + `db/tests/run_all.sql` (`\i` → `\ir`, corrige M4) |

### O que a v11 faz

- **F1 (A1):** `DROP POLICY IF EXISTS` de `ceremony-images staff write/update/delete`
  e `anamnese-files staff read` — os nomes **sem hífen** que a v03 criou com o
  cast `(foldername(name))[1]::uuid`. As versões seguras (com hífen, v05/v07/v08,
  comparação texto/texto) já existem e permanecem. Idempotente e inócuo em
  produção (lá esses nomes não existem).
- **F2 (C1):** `CREATE OR REPLACE` de `check_ceremony_capacity()` idêntico à v09,
  exceto o early-return de UPDATE, que agora exige **mesma cerimônia**. Troca de
  `ceremony_id` com status ocupante deixa de furar a capacidade.
- **M4:** `run_all.sql` passa a usar `\ir` (include relativo ao script) — roda de
  qualquer cwd, inclusive da raiz do repo.

### Verificação (banco fresh `v01→v11`, mesmo cluster local)

Apliquei a cadeia **inteira incluindo a v11** num banco novo e re-rodei sondas +
suíte **a partir da raiz do repo** (exercitando também o fix M4):

| Verificação | Antes (v10) | Depois (v11) |
|---|---|---|
| Sonda P1 — bypass de capacidade (C1) | 🔴 VULNERAVEL (cap=1 → 2 ocupantes) | ✅ **PROTEGIDO** (`ceremony_full`) |
| Sonda P3 — `anamnese-files` path não-UUID (A1) | 🔴 VULNERAVEL (`22P02`) | ✅ **PROTEGIDO** (consulta ok, 0 linhas) |
| Sonda P2 — dono auto-confirma (C2) | 🔴 VULNERAVEL | 🔴 VULNERAVEL *(intencional — fora de escopo, decisão de produto)* |
| Suíte 02 (storage conductors) | frágil (verde só com `ceremonies` vazia) | ✅ 4/4 PASS **determinístico** (policies órfãs removidas) |
| Suíte completa (a partir da raiz) | `\i` falhava fora de `db/tests/` | ✅ roda de qualquer cwd; **29/29 PASS** |
| Caso novo d5 (regressão C1) | — | ✅ PASS no v11 · **contra-prova:** FAIL sem v11 (`sem erro (bypass!)`) |

**Total pós-v11: 29/29 PASS, 0 FAIL.** A policy órfã da v03 sumiu (a suíte 02
fica verde de forma robusta, não mais dependente de tabela vazia), o bypass de
capacidade está fechado e coberto por regressão, e o `run_all.sql` roda de
qualquer diretório.

### Não corrigido nesta tarefa (por decisão consciente → MONDAY-BRIEF)

- **C2** (dono se auto-promove a `confirmada`/`check_in` e edita colunas
  sensíveis via policy owner `FOR ALL`): exige decisão de produto sobre quais
  transições o participante pode fazer. Sonda P2 continua VULNERAVEL de
  propósito — **não** improvisei uma restrição de coluna sem aprovação.
- **M1/M6** (escopo LGPD do staff-read; intenção da policy de avatar) e **A3**
  (validação server-side de `chosen_contribution` na integração PIX): idem,
  registrados para a conversa de segunda.
