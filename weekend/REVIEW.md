# Revisão profunda — PRs #4, #5, #6 e v10 (contribution tiers)

**Data:** 2026-07-04 · **Autor:** agente de fim de semana (claude/weekend-review)
**Escopo:** PR #4 (`db/hauxe_schema_patch_v08_anamnese_staff_read.sql`), PR #5 (`db/hauxe_schema_patch_v09_ceremony_management.sql`), PR #6 (`db/tests/*`, `docs/*`), v10/PR #7 (`db/hauxe_schema_patch_v10_contribution_tiers.sql`).
**Eixos pedidos:** segurança (RLS, triggers BEFORE INSERT/UPDATE, SECURITY INVOKER), concorrência (FOR UPDATE), semântica de NULL, convenções em inglês.

**Nota de contexto:** os 4 alvos já constam mergeados na `main` (merges `40ea745` → `1259030` → `1d56ac2` → `064ac0a`). A revisão vale como auditoria pós-merge; os achados críticos merecem patch corretivo (v11) antes de qualquer uso real.

---

## Resumo executivo

| Severidade | Qtde | Destaques |
|---|---|---|
| Crítico | 2 | Bypass de capacidade via UPDATE de `ceremony_id`; participante pode se auto-confirmar (pré-existente, agravado) |
| Alto | 3 | Cadeia de migrations não reproduzível (policies v03 inseguras sobrevivem); README manda rodar testes na produção; `chosen_contribution` não validado no servidor |
| Médio | 7 | LGPD (acesso staff sem filtro de status/expiração; audit_log nunca escrito), gaps de trigger/teste, `\i` relativo |
| Baixo | 7 | Robustez dos testes, convenções, contenção de lock |

O desenho geral é bom: `FOR UPDATE` serializando inscrições, `SECURITY DEFINER` com `search_path=''` + REVOKE, `IS DISTINCT FROM` para NULLs, testes transacionais com ROLLBACK. Os problemas estão nas bordas (UPDATEs que mudam FK, colunas não protegidas por RLS de coluna, e drift entre scripts do repo e estado real do banco).

---

## CRÍTICO

### C1. Trigger de capacidade é contornável mudando `ceremony_id` numa linha que já ocupa vaga
**Arquivo:** `db/hauxe_schema_patch_v09_ceremony_management.sql:110-112` (PR #5)

O early-return do UPDATE olha apenas `OLD.status`:

```sql
IF TG_OP = 'UPDATE' AND (OLD.status = ANY (v_occupying)) THEN
  RETURN NEW;  -- já ocupava (ex.: reservada->confirmada): sem nova vaga
END IF;
```

Se um UPDATE **muda `ceremony_id`** mantendo status ocupante (ex.: `reservada`), a vaga antiga é liberada e uma vaga na cerimônia nova é ocupada **sem checagem nem lock** — a premissa "já ocupava" só vale para a MESMA cerimônia. A RLS permite o ataque: a policy `registrations - owner` (`db/hauxe_schema.sql:382-383`, FOR ALL, `profile_id = auth.uid()`) não restringe colunas, então um participante autenticado pode fazer `UPDATE registrations SET ceremony_id = '<cerimônia cheia>'` via API REST e furar a fila de uma cerimônia lotada (só precisa ter uma inscrição em qualquer outra cerimônia). A policy de staff (`registrations - org staff update`) permite o mesmo dentro da org.

**Correção proposta (v11):**
```sql
IF TG_OP = 'UPDATE'
   AND (OLD.status = ANY (v_occupying))
   AND OLD.ceremony_id = NEW.ceremony_id THEN
  RETURN NEW;
END IF;
```
(Com a mudança, um UPDATE que troca de cerimônia com status ocupante passa a travar e contar a cerimônia NOVA — comportamento correto.) Alternativa complementar: proibir troca de `ceremony_id` por completo (`IF TG_OP='UPDATE' AND NEW.ceremony_id <> OLD.ceremony_id THEN RAISE`), que é o mais simples e provavelmente o produto desejado (trocar de cerimônia = cancelar + reinscrever).

### C2. Participante pode se auto-promover a `confirmada`/`check_in` e editar qualquer coluna da própria inscrição *(pré-existente v01; agravado por v09/v10)*
**Arquivo:** `db/hauxe_schema.sql:382-383`; agravantes em `db/hauxe_schema_patch_v10_contribution_tiers.sql:50` e no v09.

`registrations - owner` é `FOR ALL` sem restrição de colunas. Um participante pode:
- `UPDATE registrations SET status='confirmada'` sem pagar e sem ficha — o trigger de capacidade permite (reservada→confirmada = ocupante→ocupante) e `refresh_registration_status()` só corrigiria num próximo evento de payment/anamnese;
- `SET status='check_in'` — estado que `refresh_registration_status()` trata como terminal e **nunca mais corrige**;
- alterar `tier_id`, `chosen_contribution` (v10) e `ceremony_id` (ver C1) livremente, inclusive após pagamento.

Não foi introduzido pelos PRs revisados, mas v09 (capacidade) e v10 (`chosen_contribution`) constroem lógica de negócio em cima de colunas que o dono da linha pode adulterar. **Correção proposta (v11):** trigger BEFORE UPDATE que, quando o ator não é staff/service_role, restringe as colunas mutáveis pelo dono (permitir p.ex. `status` apenas para `cancelada`, `brings_food`, `notes`, `chosen_contribution` enquanto não pago) — ou dividir a policy owner em INSERT/SELECT/UPDATE com trigger de coluna. Requer decisão de produto sobre quais transições o participante pode fazer → **dúvida registrada para segunda**.

---

## ALTO

### A1. Cadeia de migrations do repo não é reproduzível — policies inseguras da v03 sobrevivem à v08
**Arquivos:** `db/hauxe_schema_patch_v03_storage.sql:36,46,56,80-88` vs `db/hauxe_schema_patch_v05_storage_reconcile.sql:33-34`, `db/hauxe_schema_patch_v07_conductor_avatars.sql`, `db/hauxe_schema_patch_v08_anamnese_staff_read.sql:17` (PR #4)

v05/v07/v08 dropam policies pelos **nomes que existiam no banco de produção** (criados ad-hoc, ex.: `"anamnese-files - staff lê"`, `"ceremony-images - staff faz upload"`), mas a v03 do repo criou nomes **diferentes** (`"anamnese-files staff read"`, `"ceremony-images staff write/update/delete"`). Aplicando a cadeia v01→v10 num Postgres limpo:

- `"anamnese-files staff read"` (v03, com cast `(storage.foldername(name))[1]::uuid` que lança exceção em paths não-UUID) **continua ativa** — o exato bug que o PR #4 (v08) declara corrigir permanece vivo via a policy homônima-diferente;
- `"ceremony-images staff write/update/delete"` (v03, mesmo cast inseguro) continuam ativas ao lado das versões seguras da v07 — um INSERT com path `conductors/…` pode disparar a exceção de cast na avaliação do OR de policies (ordem de avaliação não é garantida pelo planner), reproduzindo o incidente que a v07 descreve ("bloqueava TODOS os uploads no bucket").

Consequências: (1) o ambiente de teste local (tarefa 3) não reproduz a produção; (2) qualquer ambiente novo criado a partir do repo nasce com o bug. **Correção proposta:** patch de reconciliação (v11) que dropa explicitamente os nomes da v03 (`DROP POLICY IF EXISTS "anamnese-files staff read" …`, etc.) — idempotente e inócuo em produção, onde esses nomes não existem.

### A2. README do harness recomenda rodar a suíte contra o banco de PRODUÇÃO
**Arquivo:** `db/tests/README.md:17` (PR #6)

O exemplo de `PGURI` aponta para `db.xgjnsyffibdahymaropx.supabase.co` (produção). Mesmo com ROLLBACK, as suítes inserem em `auth.users`, tomam `FOR UPDATE` em `ceremonies` (contenção com usuários reais) e o `seed_test_data.sql` grava dados **persistentes** dentro da org real "Oca Guata Heté". Um erro de operação (esquecer o teardown, rodar seed no horário errado) polui produção. **Correção proposta:** trocar o exemplo para banco local/staging, e adicionar guarda nos scripts destrutivos (ex.: `DO $$ BEGIN IF current_database() = 'postgres' AND <marcador de prod> THEN RAISE 'não rode em produção'; END IF; END $$` ou exigir `SET app.allow_seed = 'on'`).

### A3. `chosen_contribution` não é validado no servidor — caminho de dinheiro confia na UI
**Arquivo:** `db/hauxe_schema_patch_v10_contribution_tiers.sql:44-55` (v10)

Documentado como decisão ("a UI valida na escolha"), mas validação de UI não é fronteira de segurança: o dono da linha pode gravar qualquer inteiro > 0 (ex.: 1 centavo) via policy owner. Enquanto a Edge Function `create-pix-charge` é mock, o risco é latente; na integração real, **o valor da cobrança precisa ser validado/derivado no servidor** (conferir `chosen_contribution ∈ ceremonies.contribution_tiers` no momento da cobrança, ou a Edge Function ler os tiers e ignorar o valor do cliente). Registrar como requisito da integração PIX. Não travar contra os tiers no banco é aceitável (admin pode mudar tiers depois), mas a cobrança não pode confiar no campo.

---

## MÉDIO

### M1. Staff-read de anamnese (tabela e storage) sem filtro de status da inscrição nem expiração — minimização LGPD
**Arquivos:** `db/hauxe_schema_patch_v08_anamnese_staff_read.sql:19-30` (PR #4); espelha `db/hauxe_schema.sql:365-373`

Uma inscrição `cancelada` (ou de cerimônia encerrada há anos) mantém a staff com acesso perpétuo à ficha de saúde e anexos. Coerente com a policy da tabela (pré-existente), então não é regressão do PR #4 — mas para dados de saúde (LGPD art. 11) o acesso deveria ser limitado a inscrições ativas (`status NOT IN ('cancelada')`) e idealmente a cerimônias não muito antigas. Decisão de produto → dúvida para segunda.

### M2. `audit_log` nunca é escrito — trilha LGPD inexistente
**Arquivo:** `db/hauxe_schema.sql:257-266,408-409` (contexto dos PRs #4/#6)

A tabela existe e tem policy de leitura, mas **nenhuma policy de INSERT e nenhum trigger/função grava nela** — o acesso da staff a anamneses (tabela e agora storage, PR #4) não deixa rastro. Para LGPD, o console deveria registrar `view_anamnese` (via RPC SECURITY DEFINER ou Edge Function). Registrado como pendência estrutural.

### M3. `on_anamnese_change` ignora inscrições em `pendente`/`aguardando_pagamento`
**Arquivo:** `db/hauxe_schema_patch_v02.sql` (função `on_anamnese_change`; contexto do PR #6/suite 06)

O loop filtra `status in ('reservada','confirmada')`, mas `refresh_registration_status()` aceita promover também `pendente`/`aguardando_pagamento` (só exclui cancelada/lista_espera/check_in). Uma inscrição legada em `aguardando_pagamento` com pagamento pago que só então preenche a ficha **não é promovida** até o próximo evento de payment. Inconsistência pré-existente; alinhar os dois filtros na v11.

### M4. `run_all.sql` usa `\i` com caminho relativo ao cwd
**Arquivo:** `db/tests/run_all.sql:7-18` (PR #6)

`psql -f db/tests/run_all.sql` a partir da raiz do repo falha ("No such file"), porque `\i` resolve pelo diretório corrente. Trocar por `\ir` (relativo ao script) resolve para qualquer cwd.

### M5. v10 sem cobertura de teste (suite 07 ausente)
**Arquivos:** `db/hauxe_schema_patch_v10_contribution_tiers.sql` × `db/tests/` (PR #6 foi mergeado antes da v10)

Os CHECKs de `contribution_tiers` (jsonpath: não-número, ≤0, não-inteiro, array 1–5) e `chosen_contribution > 0` não têm casos. São constraints fáceis de errar (modo lax do jsonpath). Propor `07_contribution_tiers.sql` na integração.

### M6. v07: comentário promete escrita só de org_admin, mas policy aceita qualquer membro
**Arquivo:** `db/hauxe_schema_patch_v07_conductor_avatars.sql` (contexto; codificado pelo teste `db/tests/02_storage_conductors.sql` caso b1, PR #6)

As policies de avatar usam `is_org_member()` (qualquer membro, inclusive `conductor`), enquanto o cabeçalho fala em org_admin — e a tabela `conductors` exige org_admin para escrita (v06). O teste b1 consagra o comportamento mais permissivo (membro-condutor faz upload). Decidir a intenção e alinhar policy+comentário+teste.

### M7. Unidade monetária dupla: centavos (v10) × reais (tabela legada `contribution_tiers`)
**Arquivo:** `db/hauxe_schema_patch_v10_contribution_tiers.sql:7-11`

Documentado no header, mas até a reconciliação o app lê a tabela legada em REAIS enquanto o schema novo guarda CENTAVOS na coluna homônima — colisão de nome (`ceremonies.contribution_tiers` × `public.contribution_tiers`) + unidades diferentes é receita para bug de 100×. Priorizar a aposentadoria da tabela legada na fase de client.

---

## BAIXO

- **B1.** `db/tests/01_conductors_rls.sql` (e demais): handlers capturam só `insufficient_privilege`; qualquer outro erro (FK, unique) aborta a transação do arquivo inteiro e os casos seguintes viram ruído. Capturar `WHEN OTHERS` com registro de FAIL melhora a robustez do relatório.
- **B2.** `db/tests/04_capacity.sql` roda apenas como papel privilegiado; falta um caso como participante autenticado, que é justamente o que valida a necessidade do SECURITY DEFINER (sem ele, o participante contaria só as próprias linhas). Sugerir caso d5.
- **B3.** `db/tests/06_async_status.sql` não cobre demoção `confirmada→reservada` (pagamento estornado) nem o caminho de UPDATE de `consent_health_data` true→false.
- **B4.** Após v09, `ceremony_conductors` fica sem policy de UPDATE (só INSERT/DELETE/SELECT). Provavelmente intencional (tabela de junção pura; troca = delete+insert), mas merece comentário explícito na migration.
- **B5.** Convenção de idioma: a tabela de resultados dos testes usa colunas em PT (`esperado`, `obtido`, `resultado`) — a regra do projeto é código/nomes em inglês (rótulos/descrições em PT são ok).
- **B6.** Re-inscrição pós-cancelamento: `UNIQUE (ceremony_id, profile_id)` obriga o client a fazer UPDATE de `cancelada→reservada` (o INSERT falha). O trigger v09 cobre a transição corretamente; só documentar o fluxo esperado do client.
- **B7.** `FOR UPDATE` em `ceremonies` serializa inscrições também contra edições de staff na linha da cerimônia (e vice-versa). Contenção aceitável no volume atual; `FOR NO KEY UPDATE` reduziria conflito com FKs sem perder a serialização entre inscrições.

---

## Pontos positivos (para manter)

- `check_ceremony_capacity`: lock `FOR UPDATE` na cerimônia antes de contar é o padrão correto anti-race em READ COMMITTED; `id <> NEW.id` trata INSERT (default de `id` já aplicado antes do BEFORE trigger); `capacity IS NULL` = ilimitado com early-return limpo.
- `SECURITY DEFINER` com `SET search_path = ''` + `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` em função só-de-trigger: padrão exemplar.
- `enforce_ceremony_conductor_same_org` como SECURITY INVOKER com raciocínio documentado de por que RLS+`IS DISTINCT FROM` produz o resultado certo em cada papel (NULL de linha invisível → mismatch → exceção). Semântica de NULL correta.
- v08: comparação texto/texto em vez de cast `::uuid` — falha graciosa para paths fora do formato ({sem pasta} → `foldername()[1]` NULL → EXISTS false).
- v10: CHECK via `jsonb_path_exists` com type-check antes das comparações numéricas (modo lax) — cobre não-número, ≤ 0, não-inteiro e arrays aninhados; `[]` rejeitado pelo BETWEEN 1 AND 5.
- Harness: 28 casos auto-contidos, transacionais (ROLLBACK), com impersonação correta (`request.jwt.claims` + `SET LOCAL ROLE authenticated`) e reversão automática de role em exceção (GUC volta no abort do subtransaction).

## Contagem dos 28 casos (referência para a tarefa 3)

| Suite | Casos |
|---|---|
| 01 conductors RLS | a1–a7 (7) |
| 02 storage conductors | b1–b4 (4) |
| 03 storage anamnese staff-read | c1–c5 (5) |
| 04 capacity | d1a, d1b, d2, d3, d4 (5) |
| 05 ceremony_conductors same-org | e1–e4 (4) |
| 06 async status | f0–f2 (3) |

## Dúvidas acumuladas (vão para o MONDAY-BRIEF)

1. **C2:** quais transições de `status` o participante pode fazer sozinho? (proposta: apenas → `cancelada`)
2. **M1:** staff deve continuar lendo ficha de inscrição cancelada/cerimônia passada? Por quanto tempo?
3. **M6:** upload de avatar de condutor: qualquer membro ou só org_admin?
4. **C1/C2:** o produto permite "trocar de cerimônia" editando a inscrição, ou é cancelar + reinscrever?
