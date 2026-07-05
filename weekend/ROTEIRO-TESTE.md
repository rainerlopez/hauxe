# Roteiro de teste manual — estado integrado (`claude/weekend-integration` + v11)

**Data:** 2026-07-05 · **Autor:** agente de fim de semana
**Escopo:** validar o estado **integrado** do banco — a cadeia de migrations
`v01→v11`, onde a **v11** (auditoria de fim de semana) corrige o bypass de
capacidade (C1) e as policies de storage órfãs da v03 (A1). Substitui, para o
estado integrado, o `docs/test-round-fase-2-3.md` (que cobria só até v09b e
apontava a connection string para **produção**).

> **Diferenças-chave vs o roteiro antigo:**
> 1. Não há passo de "mergear PRs" aqui — a ordem de merge recomendada para
>    segunda está no `weekend/MONDAY-BRIEF.md`. Este roteiro testa a branch
>    **`claude/weekend-integration`** como ela está.
> 2. **NUNCA** rode a suíte/seed contra o Supabase de **produção**
>    (`db.xgjnsyffibdahymaropx…`). Use Postgres **local** (trilha A, recomendada
>    e reproduzível) ou um projeto Supabase de **staging** descartável (trilha
>    B). O passo do banco traz uma **guarda** contra produção.
> 3. Cobre os fixes novos da v11: **F1** (upload de avatar não quebra mais o
>    bucket), **F2** (troca de `ceremony_id` para cerimônia cheia é barrada) e a
>    vertente anamnese de **A1** (path não-UUID não estoura a leitura da staff).

---

## 0. Pré-requisitos

```bash
# 1) Trazer a branch integrada (com a v11)
git fetch origin claude/weekend-integration
git checkout claude/weekend-integration
git pull origin claude/weekend-integration

# 2) Conferir que a v11 está presente
ls db/hauxe_schema_patch_v11_security_fixes.sql   # deve existir
```

- [ ] **Esperado:** a branch contém as migrations `db/hauxe_schema.sql` +
  `…v02`…`…v11` e a suíte em `db/tests/` (incl. o caso **d5** na suíte 04).

---

## 1. Banco — trilha A (Postgres LOCAL, recomendada)

Reproduz exatamente o ambiente da tarefa 3/4. Seguro: nenhum dado de produção,
tudo efêmero.

### 1.1 Subir o cluster e mockar o ambiente Supabase

O harness pressupõe primitivas do Supabase (`auth`/`storage`/roles). O mock
está versionado em `weekend/sql/00_supabase_mock.sql` (branch
`claude/weekend-review`).

```bash
# como usuário 'postgres' (initdb não roda como root)
PGDIR=/var/lib/postgresql/hauxe
mkdir -p $PGDIR && chown postgres:postgres $PGDIR
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR/data -U postgres --locale=C"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR/data \
  -o '-p 55432 -k $PGDIR -c listen_addresses=' -l $PGDIR/logfile start"

export PGHOST=$PGDIR PGPORT=55432 PGUSER=postgres
createdb hauxe_test

# mock do ambiente Supabase (pegue o arquivo da branch de memória)
git show claude/weekend-review:weekend/sql/00_supabase_mock.sql | psql -d hauxe_test -v ON_ERROR_STOP=1 -f -
```

- [ ] **Esperado:** mock aplica sem erro (roles `anon`/`authenticated`/
  `service_role`, schema `auth`/`storage`, `auth.uid()`/`storage.foldername()`).

### 1.2 Aplicar a cadeia `v01→v11`

```bash
for f in db/hauxe_schema.sql db/hauxe_schema_patch_v0{2,3,4,5,6,7,8,9}*.sql \
         db/hauxe_schema_patch_v10*.sql db/hauxe_schema_patch_v11*.sql; do
  echo "== $f =="; psql -d hauxe_test -v ON_ERROR_STOP=1 -f "$f" >/dev/null || break
done
```

- [ ] **Esperado:** todas aplicam limpo (só `NOTICE … skipping` de `DROP IF
  EXISTS`). Confirme que as policies órfãs da v03 **sumiram**:

```bash
psql -d hauxe_test -tc "select count(*) from pg_policies
  where schemaname='storage' and tablename='objects'
  and policyname in ('ceremony-images staff write','ceremony-images staff update',
                     'ceremony-images staff delete','anamnese-files staff read');"
```
- [ ] **Esperado:** `0` (a v11 dropou as 4).

### 1.3 Rodar a suíte automática (29 casos) — da raiz do repo

```bash
psql -d hauxe_test -f db/tests/run_all.sql | grep -E 'PASS|FAIL'
```

- [ ] **Esperado:** **29 linhas PASS, 0 FAIL** — inclui o caso novo **d5**
  (regressão do bypass C1). O comando roda **da raiz do repo** porque a v11
  trocou `\i` por `\ir` no `run_all.sql` (fix M4).

---

## 1'. Banco — trilha B (Supabase STAGING, opcional)

Só se você quiser validar contra um Supabase real. **Use um projeto de staging
descartável, jamais produção.**

```bash
# Guarda anti-produção: aborta se o host for o da produção
export PGURI='postgresql://postgres:[SENHA]@db.SEU-STAGING.supabase.co:5432/postgres'
case "$PGURI" in
  *xgjnsyffibdahymaropx*) echo "ABORTAR: isso é PRODUÇÃO"; exit 1;;
esac
```

- No Supabase staging, `auth`/`storage` já existem (não rode o mock).
- Aplique `v01→v11` pelo SQL Editor **ou** `psql "$PGURI" -f …` na mesma ordem
  do passo 1.2.
- Rode a suíte: cada `db/tests/0*.sql` é transacional (`ROLLBACK`), não deixa
  resíduo. **Não** rode o seed persistente aqui (ver §4).
- [ ] **Esperado:** 29/29 PASS, igual à trilha A.

---

## 2. Verificação dirigida dos fixes da v11

Sondas de segurança versionadas em `weekend/sql/99_probes.sql` (branch de
memória). Rode contra o banco `v01→v11`:

```bash
git show claude/weekend-review:weekend/sql/99_probes.sql | psql -d hauxe_test -f -
```

- [ ] **Esperado (pós-v11):**
  - **P1 (C1) → `PROTEGIDO`** — mover `ceremony_id` de uma inscrição ocupante
    para uma cerimônia cheia agora dá `ceremony_full`.
  - **P3 (A1) → `PROTEGIDO`** — `SELECT` da staff em `anamnese-files` com pasta
    **não-UUID** retorna 0 linhas (sem `22P02`).
  - **P2 (C2) → `VULNERAVEL`** — **esperado e intencional**: o dono ainda
    consegue `UPDATE … SET status='confirmada'`. Corrigir depende de decisão de
    produto (ver `weekend/MONDAY-BRIEF.md`). **Não é regressão.**

### 2.1 F1 na prática — upload de avatar não quebra o bucket

Antes da v11, a policy órfã da v03 (cast `::uuid`) estourava em qualquer upload
com path `conductors/…`. Depois da v11, o upload deve passar:

```bash
psql -d hauxe_test <<'SQL' 2>&1 | grep -iE 'INSERT|ERROR'
BEGIN;
INSERT INTO auth.users (id,email,instance_id,aud,role)
  VALUES ('c1110000-0000-0000-0000-000000000001','adm@x.invalid',
          '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO organizations (id,name,slug) VALUES ('c0000000-0000-0000-0000-0000000000aa','O','o-'||'stg');
INSERT INTO org_members (org_id,profile_id,role)
  VALUES ('c0000000-0000-0000-0000-0000000000aa','c1110000-0000-0000-0000-000000000001','org_admin');
INSERT INTO ceremonies (id,org_id,title,status,starts_at,capacity)
  VALUES ('c0c00000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000aa','C','publicada',now()+interval '1 day',5);
INSERT INTO storage.buckets (id,name,public) VALUES ('ceremony-images','ceremony-images',true) ON CONFLICT DO NOTHING;
SET LOCAL request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects (bucket_id,name,owner)
  VALUES ('ceremony-images','conductors/c0000000-0000-0000-0000-0000000000aa/avatar.jpg','c1110000-0000-0000-0000-000000000001');
RESET ROLE;
ROLLBACK;
SQL
```

- [ ] **Esperado:** `INSERT 0 1` (upload aceito), **sem** `invalid input syntax
  for type uuid`.

---

## 3. Console da Kao — ciclo de condutor (UI)

> Toca a UI; **não** altere UI neste fim de semana — apenas execute o roteiro.
> Pré: login no console (`/admin`) como **rainerdev@gmail.com** (org_admin).

Idêntico ao `docs/test-round-fase-2-3.md §2` (criar → editar → trocar foto →
remover foto → desativar → aba Inativos → reativar). A v11 **não** muda o
comportamento de UI; muda apenas quais policies de storage estão ativas.

1. **Criar condutor com foto** → [ ] avatar visível em
   `ceremony-images/conductors/{org_id}/…` (F1: upload aceito).
2. **Editar / trocar foto / remover foto** → [ ] persistem; sem erro.
3. **Desativar → Inativos → Reativar** → [ ] transita entre as abas; badges
   corretos.

> Limpeza: exclua/desative o condutor de teste. Se vinculado a cerimônia, o
> `DELETE` é **bloqueado** (RESTRICT, v09) — desvincule primeiro. Esperado.

---

## 4. Regressão do participante — ponta a ponta (UI)

> Pré: segundo navegador/conta (participante) ou o app no device.

1. **Inscrição** em cerimônia publicada → [ ] vaga garantida; status inicial
   **reservada**.
2. **Ficha (anamnese)** com consentimento → [ ] salva; cartão "ficha"
   concluído.
3. **Contribuição (PIX mock)** — escolher tier e concluir pagamento simulado →
   [ ] inscrição passa a **confirmada** automaticamente (trigger assíncrono).
4. **Upload de imagem de cerimônia** (`ceremony-images/{ceremony_id}/…`) →
   [ ] aceito (regressão v07/F1).

---

## 5. Teste manual do C1/F2 — troca de cerimônia é barrada

Complementa a sonda P1. No banco (local ou staging), com uma cerimônia **cheia**:

```bash
psql -d hauxe_test <<'SQL' 2>&1 | grep -iE 'ceremony_full|UPDATE|ERROR'
BEGIN;
INSERT INTO auth.users (id,email,instance_id,aud,role) VALUES
  ('f1110000-0000-0000-0000-000000000001','p1@x.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f1110000-0000-0000-0000-000000000002','p2@x.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO organizations (id,name,slug) VALUES ('f0000000-0000-0000-0000-0000000000aa','O','o-c1');
INSERT INTO ceremonies (id,org_id,title,status,starts_at,capacity) VALUES
  ('fc100000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-0000000000aa','Cheia','publicada',now()+interval '1 day',1),
  ('fc200000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-0000000000aa','Fonte','publicada',now()+interval '2 day',10);
-- lota a cheia (cap=1) com P1; P2 fica na fonte
INSERT INTO registrations (id,ceremony_id,profile_id) VALUES
  ('fe100000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000001','f1110000-0000-0000-0000-000000000001'),
  ('fe200000-0000-0000-0000-000000000002','fc200000-0000-0000-0000-000000000002','f1110000-0000-0000-0000-000000000002');
-- P2 tenta mover sua reserva para a cerimônia CHEIA
UPDATE registrations SET ceremony_id='fc100000-0000-0000-0000-000000000001'
  WHERE id='fe200000-0000-0000-0000-000000000002';
ROLLBACK;
SQL
```

- [ ] **Esperado (pós-v11):** o UPDATE **falha** com `ERROR: ceremony_full`. Sem
  a v11, ele passaria e a cerimônia de cap=1 ficaria com 2 ocupantes.

---

## 6. Concorrência — corrida pela última vaga

Igual ao `docs/test-round-fase-2-3.md §5` (dois terminais, `BEGIN`/`INSERT` sem
commit no T1 segura o lock; o T2 bloqueia e, após o `COMMIT` do T1, falha com
`ceremony_full`). Vale para local (crie uma cerimônia cap=1) ou staging com
seed.

- [ ] **Esperado:** T2 bloqueia; após `COMMIT` do T1, T2 destrava e falha
  `ceremony_full` (serialização via `SELECT … FOR UPDATE`).

---

## 7. Seed persistente (apenas staging, opcional)

`db/tests/seed/seed_test_data.sql` cria um cenário `TEST_`/`5eed` **dentro da org
real** por UUID — logo **não** faz sentido no Postgres local (a org não existe)
e **não** deve rodar em produção. Se usar staging que tenha essa org, siga o
`docs/test-round-fase-2-3.md §4` (seed → suite → teardown) e confirme o teardown
zerando tudo. **No fim de semana esta seção NÃO foi executada** (regra: sem
produção).

---

## 8. O que este roteiro NÃO cobre (levar para segunda)

- **C2** — dono se auto-promove a `confirmada`/`check_in` e edita colunas
  sensíveis (`tier_id`, `chosen_contribution`) via policy owner `FOR ALL`. Sonda
  P2 segue vermelha **de propósito**. Precisa de decisão de produto sobre quais
  transições o participante pode fazer.
- **M1** (escopo LGPD do staff-read: sem filtro de status/expiração), **M6**
  (intenção da policy de avatar: qualquer membro × só org_admin), **A3**
  (validar `chosen_contribution` no servidor na integração PIX real).
- Detalhes e encaminhamento: `weekend/MONDAY-BRIEF.md` e `weekend/REVIEW.md`.

---

## Resumo de aprovação

- [ ] §0 branch `claude/weekend-integration` com v11 presente
- [ ] §1 banco local: cadeia `v01→v11` aplica limpa; policies órfãs = 0
- [ ] §1.3 suíte automática **29/29 PASS** (da raiz do repo)
- [ ] §2 sondas: P1(C1) e P3(A1) `PROTEGIDO`; P2(C2) `VULNERAVEL` (esperado)
- [ ] §2.1 F1: upload de avatar aceito, sem erro de cast
- [ ] §3 ciclo de condutor (UI) OK
- [ ] §4 regressão do participante (UI) OK
- [ ] §5 C1/F2: troca de `ceremony_id` p/ cerimônia cheia dá `ceremony_full`
- [ ] §6 concorrência: 2º bloqueia e falha `ceremony_full`
- [ ] pendências C2/M1/M6/A3 registradas para segunda (não corrigir sem OK)
