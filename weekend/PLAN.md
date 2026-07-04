# Plano do Agente de Fim de Semana — Hauxe

Branch de memória: `claude/weekend-review`. Uma tarefa por execução.

## Fila

- [x] 1. Revisão profunda dos PRs #4 (anamnese staff-read), #5 (Fase 3a), #6 (test harness) e da branch v10 (contribution tiers): segurança (RLS, triggers BEFORE INSERT/UPDATE, SECURITY INVOKER), concorrência (FOR UPDATE), semântica de NULL, convenções em inglês. Saída: `weekend/REVIEW.md` com achados por severidade (crítico/alto/médio/baixo), arquivo+linha.
- [x] 2. Criar `claude/weekend-integration` a partir da main e mergear LOCALMENTE, em ordem: #4 → #5 → #6 → v10. Documentar resoluções de conflito em `weekend/INTEGRATION.md`. Push só dessa branch claude/*.
- [ ] 3. Subir Postgres local no sandbox, aplicar migrations da `claude/weekend-integration` e rodar a suíte de 28 casos do test harness. Saída: `weekend/TEST-RESULTS.md` (passou/falhou por caso). Se inviável, trace manual dos 28 casos e registrar limitação.
- [ ] 4. Para cada falha da tarefa 3: causa-raiz + correção proposta como commit na `claude/weekend-integration`, explicada no TEST-RESULTS.md.
- [ ] 5. Atualizar roteiro de teste manual para o estado integrado: `weekend/ROTEIRO-TESTE.md` (português).
- [ ] 6. Escrever `weekend/MONDAY-BRIEF.md`: resumo executivo em português — feito, achados críticos, dúvidas, ordem recomendada de merges.
- [ ] 7. Passada final de auto-revisão do próprio trabalho. Depois: responder "fila concluída" e encerrar.

## Observações entre execuções

- **2026-07-04 (exec 1):** Os PRs #4, #5, #6 e a v10 (mergeada como PR #7) **já constam mergeados na `main`** (merges 40ea745 → 1259030 → 1d56ac2 → 064ac0a, nessa ordem). A tarefa 1 (revisão) segue válida sobre os diffs dos merges. A tarefa 2 provavelmente será no-op de conflito (a integração já aconteceu na main) — documentar isso em INTEGRATION.md quando chegar lá, sem improvisar.
- Regra 2 respeitada: nenhum acesso ao Supabase de produção; MCP supabase não autenticado e não será usado.
- **Tarefa 1 concluída (exec 1):** `weekend/REVIEW.md` publicado — 2 críticos (C1: bypass de capacidade via UPDATE de ceremony_id no trigger v09; C2: participante pode se auto-confirmar via policy owner FOR ALL, pré-existente), 3 altos (A1: cadeia de migrations não reproduzível — policies v03 com cast ::uuid inseguro sobrevivem à v08 em banco fresh; A2: README dos testes aponta para produção; A3: chosen_contribution sem validação server-side), 7 médios, 7 baixos. **Impacto nas próximas tarefas:** na tarefa 3, aplicar a cadeia v01→v10 num Postgres fresh vai reproduzir A1 (esperar possível falha na suite 02 por exceção de cast); na tarefa 4, os fixes candidatos são C1 (one-liner no trigger), A1 (drops de reconciliação) e M4 (`\i`→`\ir`) — C2/M1/M6 dependem de decisão de produto, NÃO corrigir sem aprovação (registrar no MONDAY-BRIEF).
- **Tarefa 2 concluída (exec 2, 2026-07-04):** `claude/weekend-integration` criada a partir de `origin/main` (064ac0a) e pushada. Os 4 merges (#4 a0b7417 → #5 7b96ea4 → #6 9833f89 → v10 1a6b862) foram todos "Already up to date" — a integração já existia na main via PRs #4–#7. Zero conflitos; branch idêntica à main por ora. Detalhes em `weekend/INTEGRATION.md` (nesta branch de memória). Fixes da tarefa 4 entrarão como commits novos na weekend-integration.
- **Nota para tarefa 3:** Postgres local precisa mockar `auth.users`, `auth.uid()`, `auth.role()`, schema `storage` (buckets/objects/foldername + grants para roles anon/authenticated) — o harness pressupõe ambiente Supabase. Seed persistente referencia org de produção por UUID; para uso local exigiria bootstrap da org (seed NÃO faz parte dos 28 casos; as suítes 01–06 são auto-contidas).
