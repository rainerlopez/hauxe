import { useColorScheme } from 'react-native';
import { colors, type Colors, type ColorScheme } from './colors';

export function useTheme(): { scheme: ColorScheme; c: Colors } {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: colors[scheme] };
}
