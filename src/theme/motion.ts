/**
 * Motion tokens Hauxe v3 — Adendo de Motion v1
 * "Movimento que acalma e confirma, nunca que distrai."
 *
 * Para Reanimated: withTiming(val, { duration, easing: Easing.bezier(...motionBezier.out) })
 * Para confirmações (✓): withSpring(val, spring)
 */

export const duration = {
  micro:    140,  // toque, seleção, toggle
  appear:   230,  // cartões/listas surgindo
  screen:   280,  // transição entre telas
  ceremony: 700,  // APENAS a tela "Confirmado" — clímax emocional
} as const;

/** Strings CSS (web / Animated API) */
export const easing = {
  out:    'cubic-bezier(0.22, 1, 0.36, 1)',   // padrão — desaceleração expressiva
  in:     'cubic-bezier(0.4, 0, 1, 1)',        // saída — acelera ao sair
  spring: 'cubic-bezier(0.34, 1.4, 0.5, 1)',  // confirmações (✓) — micro-spring
} as const;

/** Coordenadas bezier para Reanimated Easing.bezier(x1, y1, x2, y2) */
export const motionBezier = {
  out:    [0.22, 1, 0.36, 1] as [number, number, number, number],
  in:     [0.4,  0, 1.0,  1] as [number, number, number, number],
  spring: [0.34, 1.4, 0.5, 1] as [number, number, number, number],
} as const;

/** Parâmetros de spring para Reanimated withSpring() */
export const spring = {
  damping:   14,
  stiffness: 140,
} as const;

/** Stagger entre itens de lista (hub de pendências) */
export const stagger = 64; // ms

export const motion = { duration, easing, motionBezier, spring, stagger };
