/** Papéis tipográficos do Photon Design System. Fonte: Hanken Grotesk (pesos 400–800). */

export const fontFamily = "'Hanken Grotesk', system-ui, -apple-system, sans-serif";

export interface TypeRole {
  /** px */
  size: number;
  /** multiplicador da altura de linha */
  lineHeight: number;
  weight: number;
  /** px */
  letterSpacing: number;
}

export const Typography = {
  display: { size: 34, lineHeight: 1.18, weight: 800, letterSpacing: -0.4 },
  heading: { size: 28, lineHeight: 1.2, weight: 700, letterSpacing: -0.3 },
  title: { size: 20, lineHeight: 1.3, weight: 600, letterSpacing: -0.2 },
  bodyL: { size: 17, lineHeight: 1.45, weight: 400, letterSpacing: 0 },
  bodyM: { size: 15, lineHeight: 1.4, weight: 400, letterSpacing: 0 },
  label: { size: 13, lineHeight: 1.23, weight: 600, letterSpacing: 0.1 },
  caption: { size: 12, lineHeight: 1.33, weight: 500, letterSpacing: 0.2 },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof Typography;
