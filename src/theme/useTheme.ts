import { useColorScheme } from 'react-native';
import { colors, type Colors, type ColorScheme } from './colors';

/**
 * Retorna o conjunto de cores ativo (light/dark) conforme o esquema do sistema.
 * Use sempre estes tokens nos componentes — nunca hardcodar valores hex.
 */
export function useTheme(): { scheme: ColorScheme; c: Colors } {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: colors[scheme] };
}
