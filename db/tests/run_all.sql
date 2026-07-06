-- =====================================================================
-- Executa toda a suite de validação em sequência (psql).
--   psql "$PGURI" -f db/tests/run_all.sql   (a partir de qualquer cwd)
-- Cada script é transacional (ROLLBACK) e imprime PASS/FAIL por caso.
-- Procure por qualquer linha com resultado = FAIL.
-- Usa \ir (include relativo ao próprio script) para funcionar de qualquer
-- diretório corrente — \i resolvia pelo cwd e falhava fora de db/tests.
-- =====================================================================
\echo '== 01 · RLS conductors =='
\ir 01_conductors_rls.sql
\echo '== 02 · Storage conductors =='
\ir 02_storage_conductors.sql
\echo '== 03 · Storage anamnese staff-read =='
\ir 03_storage_anamnese_staff_read.sql
\echo '== 04 · Capacidade =='
\ir 04_capacity.sql
\echo '== 05 · ceremony_conductors same-org =='
\ir 05_ceremony_conductors_same_org.sql
\echo '== 06 · Status assíncrono =='
\ir 06_async_status.sql
\echo '== 07 · Captura de CPF (v12) =='
\ir 07_cpf_capture.sql
\echo '== 08 · Guard de escrita em registrations (v13) =='
\ir 08_registration_write_guard.sql
