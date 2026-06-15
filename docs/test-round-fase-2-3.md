# Rodada de testes manuais — Fases 2 e 3

Checklist passo a passo para executar no notebook. Cada item traz o
**resultado esperado** explícito. Marque `[x]` ao concluir.

> Contexto: as migrações v05–v09b **já estão aplicadas** no banco. Os PRs ainda
> abertos são apenas o registro versionado em git — mergeá-los não muda o banco.

---

## 1. Pré-requisitos — mergear os PRs abertos

PRs envolvidos:
- **PR #4** — `feat/anamnese-staff-read` (v08: staff-read de `anamnese-files`).
- **PR #5** — `feat/admin-fase-3a-ceremonies-db` (v09/v09b: vagas, condutores N:N, same-org).

Como tocam arquivos diferentes (`db/…v08` vs `db/…v09`), não há conflito.
Ordem sugerida (numérica):

```bash
# garanta que está logado: gh auth status
gh pr checks 4 && gh pr merge 4 --squash --delete-branch
git checkout main && git pull origin main

gh pr checks 5 && gh pr merge 5 --squash --delete-branch
git checkout main && git pull origin main
```

- [ ] **Esperado:** ambos mergeiam sem conflito; `main` passa a conter
  `db/hauxe_schema_patch_v08_*.sql` e `db/hauxe_schema_patch_v09_*.sql`.
  Nenhuma mudança de comportamento no banco (já aplicadas).

> Este PR (`chore/test-harness-e-docs`) deve ser mergeado **por último**, depois
> de revisar a suite e os docs.

---

## 2. Console da Kao — ciclo completo de condutor

Pré: faça login no console (`/admin`) como **rainerdev@gmail.com** (org_admin
da Oca Guata Heté).

1. **Criar condutor com foto**
   - Crie "Condutor Teste Manual" e faça upload de uma foto.
   - [ ] **Esperado:** condutor aparece na lista **Ativos** com avatar visível
     (objeto em `ceremony-images/conductors/{org_id}/…`).
2. **Editar dados**
   - Altere nome/bio e salve.
   - [ ] **Esperado:** mudanças persistem após recarregar.
3. **Trocar foto**
   - Faça upload de uma foto diferente.
   - [ ] **Esperado:** novo avatar substitui o anterior (sem duplicar; o
     upsert usa UPDATE no mesmo path).
4. **Remover foto**
   - Remova o avatar.
   - [ ] **Esperado:** condutor volta ao placeholder; sem erro.
5. **Desativar (com confirmação)**
   - Desative o condutor; confirme no diálogo.
   - [ ] **Esperado:** sai de **Ativos**; aparece em **Inativos**; badge de
     contagem de inativos incrementa.
6. **Aba/badge Inativos**
   - Abra a aba **Inativos**.
   - [ ] **Esperado:** o condutor desativado está listado lá.
7. **Reativar**
   - Reative o condutor.
   - [ ] **Esperado:** volta para **Ativos**; some de **Inativos**.

> Limpeza: exclua o "Condutor Teste Manual" ao final (ou desative). Se ele
> estiver vinculado a alguma cerimônia, o `DELETE` será **bloqueado**
> (RESTRICT) — desvincule primeiro. Isso é o comportamento esperado (v09).

---

## 3. Regressão do participante (ponta a ponta)

Pré: use um segundo navegador/conta (participante) OU o app no device.

1. **Inscrição**
   - Numa cerimônia **publicada**, faça a inscrição.
   - [ ] **Esperado:** vaga garantida; status inicial **reservada**.
2. **Ficha (anamnese)**
   - Preencha a ficha e dê o consentimento.
   - [ ] **Esperado:** ficha salva; cartão de tarefa "ficha" fica concluído.
3. **Contribuição (PIX mock)**
   - Escolha um tier; conclua o pagamento simulado.
   - [ ] **Esperado:** ao confirmar pagamento, a inscrição passa a
     **confirmada** automaticamente (trigger assíncrono).
4. **Upload de imagem de cerimônia (regressão v07)**
   - No console, faça upload de uma imagem de cerimônia
     (`ceremony-images/{ceremony_id}/…`).
   - [ ] **Esperado:** upload aceito (a v07 corrigiu o cast que bloqueava
     uploads quando o path não era UUID).

---

## 4. Banco — seed → suite → teardown

Pré: exporte a connection string do Postgres
(`Project Settings → Database → Connection string`):

```bash
export PGURI='postgresql://postgres:[SENHA]@db.xgjnsyffibdahymaropx.supabase.co:5432/postgres'
```

```bash
# 1) Seed (cria cenário TEST_ na Oca)
psql "$PGURI" -f db/tests/seed/seed_test_data.sql
#    Esperado: linha final "seed aplicado" com participantes=3, condutores=2,
#    cerimonias=3, inscricoes=5, arquivos=2.

# 2) Suite (cada script imprime PASS/FAIL; todos os scripts dão ROLLBACK)
for f in db/tests/0*.sql; do echo "== $f =="; psql "$PGURI" -f "$f"; done
#    Esperado: TODAS as linhas com resultado = PASS. Procure por qualquer FAIL.

# 3) Teardown (remove tudo do seed)
psql "$PGURI" -f db/tests/seed/teardown_test_data.sql
#    Esperado: linha final "teardown concluído" com TODAS as colunas = 0.
```

- [ ] **Esperado:** seed mostra os totais acima; suite 100% **PASS**; teardown
  zera tudo (sem resíduo `TEST_`/`5eed`).

> No console, entre o seed e o teardown, você verá em `/admin` os condutores
> `TEST_Condutor_Ativo/Inativo`, as cerimônias `TEST_*` e os inscritos de teste
> — útil para conferir visualmente listas e a ficha de saúde (staff-read).

---

## 5. (Opcional) Teste de concorrência — corrida pela última vaga

Demonstra a serialização via `SELECT … FOR UPDATE` no `check_ceremony_capacity`
(o caso que não é exercitável por chamadas SQL avulsas). Use a cerimônia
`TEST_Cerimonia_Cap1` (capacity=1, criada pelo seed) e dois participantes do seed.

Pré: rode o **seed** (passo 4.1). Abra **dois terminais**.

**Terminal 1:**
```bash
psql "$PGURI"
```
```sql
BEGIN;
INSERT INTO registrations (ceremony_id, profile_id)
VALUES ('5eedce00-0000-0000-0000-0000000000c1','5eed0000-0000-0000-0000-000000000001');
-- NÃO commitar ainda (segura o lock da cerimônia)
```

**Terminal 2:**
```bash
psql "$PGURI"
```
```sql
BEGIN;
INSERT INTO registrations (ceremony_id, profile_id)
VALUES ('5eedce00-0000-0000-0000-0000000000c1','5eed0000-0000-0000-0000-000000000002');
-- Esta instrução vai FICAR BLOQUEADA, aguardando o Terminal 1.
```
- [ ] **Esperado:** o Terminal 2 **bloqueia** (não retorna o prompt).

**Terminal 1:**
```sql
COMMIT;   -- confirma a 1ª inscrição (vaga única ocupada)
```
- [ ] **Esperado:** assim que o Terminal 1 dá `COMMIT`, o Terminal 2 **destrava**
  e falha com:
  ```
  ERROR:  ceremony_full
  HINT:   A cerimônia atingiu a capacidade máxima.
  ```

**Terminal 2:**
```sql
ROLLBACK;
```

Limpeza: rode o **teardown** (passo 4.3).

---

## Resumo de aprovação

- [ ] §1 PRs mergeados
- [ ] §2 ciclo de condutor OK
- [ ] §3 regressão do participante OK
- [ ] §4 seed→suite→teardown: suite 100% PASS, teardown zerado
- [ ] §5 (opcional) concorrência: 2º bloqueia e falha `ceremony_full`
- [ ] mergear o PR `chore/test-harness-e-docs` por último
