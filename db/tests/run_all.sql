-- =====================================================================
-- Executa toda a suite de validação em sequência (psql).
--   psql "$PGURI" -f db/tests/run_all.sql
-- Cada script é transacional (ROLLBACK) e imprime PASS/FAIL por caso.
-- Procure por qualquer linha com resultado = FAIL.
-- =====================================================================
\echo '== 01 · RLS conductors =='
\i 01_conductors_rls.sql
\echo '== 02 · Storage conductors =='
\i 02_storage_conductors.sql
\echo '== 03 · Storage anamnese staff-read =='
\i 03_storage_anamnese_staff_read.sql
\echo '== 04 · Capacidade =='
\i 04_capacity.sql
\echo '== 05 · ceremony_conductors same-org =='
\i 05_ceremony_conductors_same_org.sql
\echo '== 06 · Status assíncrono =='
\i 06_async_status.sql
\echo '== 07 · Captura de CPF (v12) =='
\i 07_cpf_capture.sql
