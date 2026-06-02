/**
 * Espaçamento Hauxe v3 — base 8px
 * screenX: padding lateral padrão das telas (22px)
 * blockGap: respiro entre blocos (26px)
 */

export const spacing = {
  0:        0,
  xs:       4,   // micro-ajustes
  sm:       8,   // base
  md:       12,  // interno
  lg:       16,  // gap padrão
  xl:       22,  // screenX — padding lateral das telas
  '2xl':    24,
  '3xl':    32,
  blockGap: 26,  // respiro entre blocos de formulário
} as const;

export const borderRadius = {
  none:   0,
  sm:     6,
  field:  14,  // campos e inputs
  card:   16,  // cartões
  button: 14,  // botões
  pill:   999,
} as const;

export const sizing = {
  field:    52,  // altura de campos
  button:   52,  // altura do botão primário
  minTouch: 48,  // alvo mínimo de toque
} as const;
