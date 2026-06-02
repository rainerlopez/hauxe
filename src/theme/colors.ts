/**
 * Paleta Hauxe v3 — Modo A (dourado) · identidade Oca Guata Heté
 * Fonte: export dos tokens finais do Claude Design (hauxe.tokens.js)
 */

export const palette = {
  // Verde primário — oliva quente (extraído do logo da serpente Guata Heté)
  forest:      '#29402B',
  forestDeep:  '#1B301E',
  onForest:    '#F3F1E7',
  onForest2:   'rgba(243,241,231,0.70)',

  // Acento — ocre/âmbar das miçangas (Modo A)
  accent:      '#C68A2E',
  accentDeep:  '#A56F1F',
  accentInk:   '#241803',
  accentSoft:  'rgba(198,138,46,0.08)',
  accentSoftD: 'rgba(198,138,46,0.12)',
  focusRing:   'rgba(198,138,46,0.40)',

  // Semântica
  success: '#2F7D5B',
  error:   '#C0392B',

  // Areia (fundo claro)
  sand:    '#F6F2E9',
  sand2:   '#EFEADD',
  tintL:   '#F1F4EE',
  white:   '#FFFFFF',
  ink:     '#1C2620',
  ink2:    '#5C665E',
  ink3:    'rgba(28,38,32,0.45)',

  // Floresta noturna (modo escuro)
  night:         '#10201A',
  night2:        '#0C1A15',
  nightSurface:  '#172A22',
  nightTint:     '#1B3127',
  nightText:     '#EAF0EA',
  forestDarkBg:  '#2C5238',
  forestDarkDeep:'#1B3A26',
} as const;

export const colors = {
  light: {
    bg:          palette.sand,
    bg2:         palette.sand2,
    surface:     palette.white,
    tint:        palette.tintL,
    forest:      palette.forest,
    forestDeep:  palette.forestDeep,
    onForest:    palette.onForest,
    text:        palette.ink,
    text2:       palette.ink2,
    text3:       palette.ink3,
    accent:      palette.accent,
    accentDeep:  palette.accentDeep,
    accentInk:   palette.accentInk,
    accentSoft:  palette.accentSoft,
    focusRing:   palette.focusRing,
    success:     palette.success,
    error:       palette.error,
    border:      'rgba(28,38,32,0.13)',
    border2:     'rgba(28,38,32,0.07)',
  },
  dark: {
    bg:          palette.night,
    bg2:         palette.night2,
    surface:     palette.nightSurface,
    tint:        palette.nightTint,
    forest:      palette.forestDarkBg,
    forestDeep:  palette.forestDarkDeep,
    onForest:    palette.onForest,
    text:        palette.nightText,
    text2:       'rgba(234,240,234,0.62)',
    text3:       'rgba(234,240,234,0.40)',
    accent:      palette.accent,
    accentDeep:  palette.accentDeep,
    accentInk:   palette.accentInk,
    accentSoft:  palette.accentSoftD,
    focusRing:   'rgba(198,138,46,0.45)',
    success:     palette.success,
    error:       '#E57373',
    border:      'rgba(234,240,234,0.14)',
    border2:     'rgba(234,240,234,0.08)',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Colors = typeof colors.light;
