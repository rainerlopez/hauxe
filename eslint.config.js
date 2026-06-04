// Flat config (ESLint 10) — base oficial do Expo SDK 56.
// As Edge Functions (supabase/) rodam em Deno e têm seu próprio ambiente.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/**'],
  },
  {
    rules: {
      // Padrão de data-fetching do projeto (hooks com State union) reseta para
      // 'loading' no início do efeito antes do fetch. Mantemos como aviso em
      // vez de erro para não exigir refatorar hooks que já funcionam.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
