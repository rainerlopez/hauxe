/**
 * Tipografia Hauxe
 * Corpo / UI: Schibsted Grotesk — carregada via @expo-google-fonts/schibsted-grotesk
 * Display / títulos: Fraunces — carregada via @expo-google-fonts/fraunces
 * Nomes devem corresponder exatamente às chaves passadas ao useFonts() em app/_layout.tsx.
 */

export const fontFamily = {
  sans:        'SchibstedGrotesk_400Regular',
  sansMedium:  'SchibstedGrotesk_500Medium',
  sansBold:    'SchibstedGrotesk_700Bold',
  serif:       'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  serifBold:   'Fraunces_700Bold',
} as const;

export const fontSize = {
  xs:    12,
  sm:    14,
  md:    16,
  lg:    18,
  xl:    20,
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
  regular: '400' as const,
  medium:  '500' as const,
  bold:    '700' as const,
} as const;
