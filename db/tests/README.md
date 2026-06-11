# Suite de validação SQL — Hauxe (fases v05–v09)

Scripts idempotentes e **re-rodáveis** que consolidam todas as validações de
banco feitas ad-hoc nas fases anteriores. Cada script:

- É **auto-contido**: cria seus próprios fixtures (UUIDs fixos, sintéticos),
  roda as asserções e dá `ROLLBACK` — **não deixa resíduo** e **não depende**
  do seed nem de dados reais.
- É **transacional**: tudo roda dentro de um único `BEGIN … ROLLBACK`.
- Imprime uma tabela final com coluna `resultado` = `PASS`/`FAIL` por caso.

## Como rodar

### Via psql (recomendado para a rodada manual)
```bash
# variável de conexão (Supabase → Project Settings → Database → Connection string)
export PGURI='postgresql://postgres:[SENHA]@db.xgjnsyffibdahymaropx.supabase.co:5432/postgres'

psql "$PGURI" -f db/tests/01_conductors_rls.sql
psql "$PGURI" -f db/tests/02_storage_conductors.sql
psql "$PGURI" -f db/tests/03_storage_anamnese_staff_read.sql
psql "$PGURI" -f db/tests/04_capacity.sql
psql "$PGURI" -f db/tests/05_ceremony_conductors_same_org.sql
psql "$PGURI" -f db/tests/06_async_status.sql
```

Cada arquivo imprime a tabela de resultados ao final. Procure por qualquer
linha com `resultado = FAIL`.

### Via Supabase MCP / SQL Editor
Cole o conteúdo de cada `.sql` e execute. A última instrução antes do
`ROLLBACK` é um `SELECT` que devolve a tabela de PASS/FAIL.

## Mecanismo de impersonação

As policies de RLS dependem de `auth.uid()` e `auth.role()`. Dentro de cada
transação simulamos um usuário autenticado assim:

```sql
SELECT set_config('request.jwt.claims',
  '{"sub":"<UUID-do-usuario>","role":"authenticated"}', true);  -- local à txn
SET LOCAL ROLE authenticated;   -- força a RLS (authenticated não tem BYPASSRLS)
-- ... consultas sob a ótica do usuário ...
RESET ROLE;                     -- volta ao papel privilegiado
```

- `auth.uid()` lê o `sub` do GUC `request.jwt.claims`.
- `auth.role()` lê o `role` do mesmo GUC.
- `SET LOCAL ROLE authenticated` faz o Postgres **aplicar** a RLS (o papel do
  pool — `postgres`/service — tem bypass; `authenticated` não).

> ⚠️ Os fixtures inserem em `auth.users` (com `instance_id/aud/role/email`),
> o que dispara `handle_new_user` e cria o `profiles` correspondente. Como tudo
> roda em `ROLLBACK`, nada disso persiste.

## Cobertura

| Script | Área | Fase |
|---|---|---|
| `01_conductors_rls.sql` | RLS de `conductors` (escrita org_admin, leitura membro, sem-org bloqueado) | v06 |
| `02_storage_conductors.sql` | Storage `conductors/{org_id}/…` (upload por org, leitura pública) | v07 |
| `03_storage_anamnese_staff_read.sql` | Storage `anamnese-files` (staff-read por org, dono intacto) | v08 |
| `04_capacity.sql` | Capacidade de vagas (cheia, cancelamento, NULL, auto-update) | v09 |
| `05_ceremony_conductors_same_org.sql` | Junção mesma-org (INSERT/UPDATE) + RESTRICT no DELETE | v09/v09b |
| `06_async_status.sql` | Promoção assíncrona a `confirmada` (intake + pagamento) | MVP |

## Seeds (rodada manual)

`seed/seed_test_data.sql` e `seed/teardown_test_data.sql` criam/removem um
cenário **persistente** dentro da org **Oca Guata Heté** (prefixo `TEST_`) para
exploração manual no console. Veja `docs/test-round-fase-2-3.md`.
