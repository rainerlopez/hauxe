/**
 * Tipografia Hauxe v3
 * UI / corpo: Schibsted Grotesk — pesos 400, 500, 600
 * Momentos cerimoniais: Fraunces 500 Medium — títulos, saudações
 * Carregada via @expo-google-fonts em app/_layout.tsx
 */

export const fontFamily = {
  sans:        'SchibstedGrotesk_400Regular',
  sansMedium:  'SchibstedGrotesk_500Medium',
  sansSemi:    'SchibstedGrotesk_600SemiBold',
  serif:       'Fraunces_500Medium',
  serifItalic: 'Fraunces_400Regular_Italic',
  serifBold:   'Fraunces_700Bold',
} as const;

export const fontSize = {
  kicker:  11.5,  // labels de seção em caps
  micro:   12.5,  // aux, microcopy
  aux:     13,    // auxiliar
  label:   13.5,  // label de campo
  bodySm:  15,    // corpo compacto
  body:    16,    // corpo / subtítulo
  title:   26,    // título de tela
  hero:    30,    // título hero (login recorrente)
} as const;

export const lineHeight = {
  tight:  1.12,
  snug:   1.2,
  normal: 1.45,
} as const;

export const fontWeight = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
} as const;
