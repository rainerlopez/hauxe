/**
 * Tipografia Hauxe
 * Corpo / UI: Schibsted Grotesk (Google Fonts — system fallback: sans-serif)
 * Display / títulos expressivos: Fraunces (Google Fonts — system fallback: serif)
 * TODO: carregar via expo-font no _layout.tsx quando os arquivos de fonte estiverem em assets/fonts/
 */

export const fontFamily = {
  sans:         'SchibstedGrotesk-Regular',
  sansMedium:   'SchibstedGrotesk-Medium',
  sansBold:     'SchibstedGrotesk-Bold',
  serif:        'Fraunces-Regular',
  serifItalic:  'Fraunces-Italic',
  serifBold:    'Fraunces-Bold',

  // fallbacks seguros enquanto as fontes não estiverem carregadas
  sansFallback:  'System',
  serifFallback: 'Georgia',
} as const;

export const fontSize = {
  xs:   12,
  sm:   14,
  md:   16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
} as const;

export const lineHeight = {
  tight:   1.2,
  normal:  1.5,
  relaxed: 1.75,
} as const;

export const fontWeight = {
  regular: '400',
  medium:  '500',
  bold:    '700',
} as const;
