# Plano do Agente de Fim de Semana — Hauxe

Branch de memória: `claude/weekend-review`. Uma tarefa por execução.

## Fila

- [ ] 1. Revisão profunda dos PRs #4 (anamnese staff-read), #5 (Fase 3a), #6 (test harness) e da branch v10 (contribution tiers): segurança (RLS, triggers BEFORE INSERT/UPDATE, SECURITY INVOKER), concorrência (FOR UPDATE), semântica de NULL, convenções em inglês. Saída: `weekend/REVIEW.md` com achados por severidade (crítico/alto/médio/baixo), arquivo+linha.
- [ ] 2. Criar `claude/weekend-integration` a partir da main e mergear LOCALMENTE, em ordem: #4 → #5 → #6 → v10. Documentar resoluções de conflito em `weekend/INTEGRATION.md`. Push só dessa branch claude/*.
- [ ] 3. Subir Postgres local no sandbox, aplicar migrations da `claude/weekend-integration` e rodar a suíte de 28 casos do test harness. Saída: `weekend/TEST-RESULTS.md` (passou/falhou por caso). Se inviável, trace manual dos 28 casos e registrar limitação.
- [ ] 4. Para cada falha da tarefa 3: causa-raiz + correção proposta como commit na `claude/weekend-integration`, explicada no TEST-RESULTS.md.
- [ ] 5. Atualizar roteiro de teste manual para o estado integrado: `weekend/ROTEIRO-TESTE.md` (português).
- [ ] 6. Escrever `weekend/MONDAY-BRIEF.md`: resumo executivo em português — feito, achados críticos, dúvidas, ordem recomendada de merges.
- [ ] 7. Passada final de auto-revisão do próprio trabalho. Depois: responder "fila concluída" e encerrar.

## Observações entre execuções

- **2026-07-04 (exec 1):** Os PRs #4, #5, #6 e a v10 (mergeada como PR #7) **já constam mergeados na `main`** (merges 40ea745 → 1259030 → 1d56ac2 → 064ac0a, nessa ordem). A tarefa 1 (revisão) segue válida sobre os diffs dos merges. A tarefa 2 provavelmente será no-op de conflito (a integração já aconteceu na main) — documentar isso em INTEGRATION.md quando chegar lá, sem improvisar.
- Regra 2 respeitada: nenhum acesso ao Supabase de produção; MCP supabase não autenticado e não será usado.
