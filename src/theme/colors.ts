/**
 * Paleta Hauxe — Modo A (dourado) + verde da marca
 * TODO: valores finais virão do export do Claude Design / Figma tokens.
 * Por enquanto, placeholders alinhados com a identidade visual inicial.
 */

export const palette = {
  // Dourado (primária)
  gold50:  '#FDF8EE',
  gold100: '#F9EDCC',
  gold200: '#F2D88A',
  gold300: '#E8C148',
  gold400: '#D4A017', // primária light
  gold500: '#B8880F',
  gold600: '#8F6A0B',
  gold700: '#664D08',
  gold800: '#3D2E05',
  gold900: '#1A1200',

  // Verde da marca (secundária / sucesso)
  green50:  '#EDFAF2',
  green100: '#C8F0D8',
  green200: '#8FDEB2',
  green300: '#4FC882',
  green400: '#27AE60', // verde marca
  green500: '#1E8A4A',
  green600: '#166636',
  green700: '#0F4424',
  green800: '#072212',
  green900: '#030F08',

  // Neutros
  black:   '#0D0D0D',
  white:   '#FAFAFA',
  gray50:  '#F5F5F5',
  gray100: '#E8E8E8',
  gray200: '#D1D1D1',
  gray300: '#ABABAB',
  gray400: '#858585',
  gray500: '#5E5E5E',
  gray600: '#3D3D3D',
  gray700: '#2B2B2B',
  gray800: '#1A1A1A',
  gray900: '#111111',

  // Semânticos
  error:   '#D93025',
  warning: '#F59E0B',
  info:    '#3B82F6',
};

export const colors = {
  light: {
    primary:      palette.gold400,
    primaryDark:  palette.gold600,
    secondary:    palette.green400,
    background:   palette.white,
    surface:      palette.gray50,
    text:         palette.gray900,
    textMuted:    palette.gray500,
    border:       palette.gray200,
    error:        palette.error,
    warning:      palette.warning,
    success:      palette.green400,
  },
  dark: {
    primary:      palette.gold300,
    primaryDark:  palette.gold400,
    secondary:    palette.green300,
    background:   palette.gray900,
    surface:      palette.gray800,
    text:         palette.white,
    textMuted:    palette.gray400,
    border:       palette.gray700,
    error:        '#FF6B6B',
    warning:      '#FCD34D',
    success:      palette.green300,
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Colors = typeof colors.light;
