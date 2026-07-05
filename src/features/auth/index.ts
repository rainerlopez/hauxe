// Feature: autenticação (sign-in, sign-up, sessão) — e-mail = login, CPF = senha
export { AuthProvider, useAuth } from './AuthContext';
export { formatCpf, isValidCpf, sanitizeCpf } from './cpf';
