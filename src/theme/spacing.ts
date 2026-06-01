/**
 * Espaçamento Hauxe — base 8px
 * Todos os valores são múltiplos de 8, exceto `xs` (4px) para micro-ajustes.
 */

export const spacing = {
  0:    0,
  xs:   4,   // 0.5 × base
  sm:   8,   // 1 × base
  md:   16,  // 2 × base
  lg:   24,  // 3 × base
  xl:   32,  // 4 × base
  '2xl': 48, // 6 × base
  '3xl': 64, // 8 × base
  '4xl': 96, // 12 × base
} as const;

export const borderRadius = {
  none: 0,
  sm:   4,
  md:   8,
  lg:   16,
  xl:   24,
  full: 9999,
} as const;
