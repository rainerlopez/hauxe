/**
 * Utilitários de CPF para o fluxo de autenticação (e-mail = login, CPF = senha).
 *
 * O CPF é sempre normalizado para os 11 dígitos (sem pontuação) antes de ir
 * ao Supabase Auth — assim "123.456.789-09" e "12345678909" autenticam igual.
 */

/** Remove tudo que não for dígito e limita a 11 dígitos. */
export function sanitizeCpf(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

/** Máscara progressiva 000.000.000-00 para exibição durante a digitação. */
export function formatCpf(value: string): string {
  const d = sanitizeCpf(value);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Validação oficial dos dígitos verificadores (módulo 11).
 * Rejeita sequências de dígito repetido (000..., 111...), que passam no
 * cálculo mas não são CPFs válidos.
 */
export function isValidCpf(value: string): boolean {
  const cpf = sanitizeCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}
