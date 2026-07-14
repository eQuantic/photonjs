/** Escalas do Photon Design System: espaço (base 4dp, gap-owned), raio e elevação. */

/** Espaço — base 4dp. Layout gap-owned: sem margens; padding interno + `gap`. */
export const Space = {
  S1: 4,
  S2: 8,
  S3: 12,
  S4: 16,
  S5: 20,
  S6: 24,
  S8: 32,
  S10: 40,
  S12: 48,
  S16: 64,
} as const;
export type SpaceToken = keyof typeof Space;

/** Raio de canto. `Full` = pílula (clampado a min(w,h)/2 na aplicação). */
export const Radius = {
  Xs: 4,
  Sm: 6,
  Md: 10,
  Lg: 14,
  Xl: 20,
  Full: 9999,
} as const;
export type RadiusToken = keyof typeof Radius;

/** Sombra: offset Y, blur, spread (px) e alpha (0..1) sobre `shadowColor`. */
export interface ShadowSpec {
  offsetY: number;
  blur: number;
  spread: number;
  alpha: number;
}

/** Elevação E0–E5. Dark: E1–E2 exigem borda 1dp adicional (ver design system). */
export const Elevation: Record<"E0" | "E1" | "E2" | "E3" | "E4" | "E5", ShadowSpec | null> = {
  E0: null,
  E1: { offsetY: 1, blur: 3, spread: 0, alpha: 0.1 },
  E2: { offsetY: 2, blur: 8, spread: 0, alpha: 0.12 },
  E3: { offsetY: 6, blur: 16, spread: -2, alpha: 0.16 },
  E4: { offsetY: 12, blur: 28, spread: -4, alpha: 0.2 },
  E5: { offsetY: 20, blur: 44, spread: -6, alpha: 0.26 },
};
export type ElevationToken = keyof typeof Elevation;

/** Cor base da sombra (o alpha vem do `ShadowSpec`). */
export const shadowColor = "#0F1720";
