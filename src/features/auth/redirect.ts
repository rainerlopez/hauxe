import * as Linking from 'expo-linking';

/**
 * URL para onde o link de confirmação de cadastro deve redirecionar.
 *
 * - Web: a origin atual + /callback (em dev, http://localhost:8081/callback).
 * - Nativo: o deep link do app (hauxe://callback) — ou exp://.../--/callback no Expo Go.
 *
 * `Linking.createURL` resolve isso por plataforma automaticamente. Pode ser
 * sobrescrito por EXPO_PUBLIC_AUTH_REDIRECT_URL (útil para staging/produção web).
 *
 * IMPORTANTE: a URL resolvida precisa estar na allowlist de Redirect URLs do
 * Supabase (Auth → URL Configuration), senão o redirect cai na Site URL.
 */
export function resolveRedirectUrl(): string {
  const override = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
  if (override) return override;
  return Linking.createURL('/callback');
}
