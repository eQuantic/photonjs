/** Movimento do Photon Design System. Regra: animar apenas `transform` e `opacity`. */

/** Durações (ms). `reduceMotion` = crossfade que substitui todo movimento. */
export const Duration = {
  fast: 100,
  base: 200,
  slow: 300,
  reduceMotion: 120,
} as const;
export type DurationToken = keyof typeof Duration;

/** Curvas de easing. */
export const Easing = {
  /** Movimentos on-screen (indicador de tab, thumb). */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /** Entradas (sheets, toasts, page push). */
  decelerate: "cubic-bezier(0, 0, 0, 1)",
  /** Saídas (duração = ⅔ da entrada). */
  accelerate: "cubic-bezier(0.3, 0, 1, 1)",
} as const;
export type EasingToken = keyof typeof Easing;

/** Mola para liberação de gesto (snap de sheet, swipe settle). */
export const Spring = { stiffness: 380, damping: 34, mass: 1 } as const;
