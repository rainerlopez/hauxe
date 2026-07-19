/**
 * Traduz erros crus do Postgrest/RLS para mensagens amigáveis em PT-BR.
 * A RLS é a camada real de segurança — quando ela nega uma escrita, o
 * Postgrest devolve mensagens técnicas em inglês que não servem para a UI.
 */
export function friendlyDbError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('row-level security') || m.includes('42501') || m.includes('permission denied')) {
    return 'Você não tem permissão para esta ação — fale com quem administra o espaço.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Falha de conexão. Verifique sua internet e tente de novo.';
  }
  return raw;
}
