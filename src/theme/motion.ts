/**
 * Motion tokens Hauxe
 * Baseado no adendo de motion: micro 120-150ms, transição 240-300ms, easing ease-out.
 * Usar com react-native-reanimated (withTiming / Easing).
 */

export const duration = {
  /** Micro-interações: press, toggle, ícone — 120–150 ms */
  micro:       140,
  /** Transições de tela / modal slide — 240–300 ms */
  transition:  270,
  /** Animações de entrada expressivas (splash, hero) */
  expressive:  400,
} as const;

/**
 * Easings como strings CSS (para web / Animated API).
 * Para Reanimated, use os equivalentes de Easing.bezier().
 */
export const easing = {
  /** Padrão: sai rápido, desacelera — sensação natural */
  easeOut:   'cubic-bezier(0.0, 0.0, 0.2, 1)',
  /** Entrada: começa devagar, acelera */
  easeIn:    'cubic-bezier(0.4, 0.0, 1, 1)',
  /** Entrada e saída suaves */
  easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  /** Linear — para loops / spinners */
  linear:    'linear',
} as const;

/**
 * Bezier coords para Reanimated Easing.bezier(x1, y1, x2, y2)
 * Usar: withTiming(value, { duration: duration.micro, easing: Easing.bezier(...motionEasing.easeOut) })
 */
export const motionEasing = {
  easeOut:   [0.0, 0.0, 0.2, 1] as [number, number, number, number],
  easeIn:    [0.4, 0.0, 1.0, 1] as [number, number, number, number],
  easeInOut: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
} as const;
