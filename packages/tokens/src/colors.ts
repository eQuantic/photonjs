/**
 * Cores do Photon Design System (equantic-ui). Valores canônicos, agnósticos de plataforma.
 * Contraste de todos os pares verificado WCAG AA/AAA no design system.
 */

/** Variante interativa: 5 sub-tokens (esquema `Variante.SubToken`). */
export interface ColorVariant {
  /** Fundo/cor da ação em repouso. */
  base: string;
  /** Conteúdo sobre `base` (texto/ícone). */
  onBase: string;
  /** Estado pressionado. */
  pressed: string;
  /** Fundo sutil (chips, realces). */
  subtle: string;
  /** Conteúdo sobre `subtle`. */
  onSubtle: string;
}

export interface ColorScheme {
  background: string;
  surface: string;
  surfaceSubtle: string;
  border: string;
  borderStrong: string;
  text: { primary: string; secondary: string; muted: string; inverse: string };
  primary: ColorVariant;
  secondary: ColorVariant;
  destructive: ColorVariant;
  success: ColorVariant;
  warning: ColorVariant;
  info: ColorVariant;
  /** Cor de link (texto). */
  link: string;
  /** Anel de foco (2dp de offset). */
  focus: string;
  /** Sobreposição de scrim (overlays/sheets). */
  scrim: string;
}

export const light: ColorScheme = {
  background: "#F5F6F8",
  surface: "#FFFFFF",
  surfaceSubtle: "#EFF1F4",
  border: "#E2E5EA",
  borderStrong: "#C9CED6",
  text: { primary: "#171B21", secondary: "#4B5563", muted: "#5F6B7A", inverse: "#FFFFFF" },
  primary: { base: "#0050A0", onBase: "#FFFFFF", pressed: "#00427F", subtle: "#E8F1FA", onSubtle: "#003E7E" },
  secondary: { base: "#E9EDF2", onBase: "#3A4350", pressed: "#DCE2EA", subtle: "#E9EDF2", onSubtle: "#3A4350" },
  destructive: { base: "#B42318", onBase: "#FFFFFF", pressed: "#8F1D1D", subtle: "#FCEBEA", onSubtle: "#8F1D1D" },
  success: { base: "#3B7A22", onBase: "#FFFFFF", pressed: "#2C5E17", subtle: "#EDF6E6", onSubtle: "#2C5E17" },
  warning: { base: "#8A5A00", onBase: "#FFFFFF", pressed: "#6E4700", subtle: "#FBF3DF", onSubtle: "#7A5200" },
  info: { base: "#0C6C86", onBase: "#FFFFFF", pressed: "#0A5468", subtle: "#E4F3F8", onSubtle: "#0A5468" },
  link: "#0050A0",
  focus: "#0050A0",
  scrim: "rgba(11,14,18,0.40)",
};

export const dark: ColorScheme = {
  background: "#0C0F13",
  surface: "#14181E",
  surfaceSubtle: "#1C232B",
  border: "#2A323D",
  borderStrong: "#3D4754",
  text: { primary: "#F2F4F7", secondary: "#AEB7C2", muted: "#8B95A3", inverse: "#171B21" },
  primary: { base: "#5CA2E8", onBase: "#06263F", pressed: "#7CB5EE", subtle: "#0F2740", onSubtle: "#A8CDF2" },
  secondary: { base: "#242C36", onBase: "#D7DDE5", pressed: "#2E3844", subtle: "#242C36", onSubtle: "#D7DDE5" },
  destructive: { base: "#E5645C", onBase: "#3B0704", pressed: "#F28B85", subtle: "#3A1210", onSubtle: "#F4A9A4" },
  success: { base: "#85C05E", onBase: "#12290A", pressed: "#9ACD74", subtle: "#16290C", onSubtle: "#B5DB97" },
  warning: { base: "#E8B04B", onBase: "#2E1B02", pressed: "#F0C06B", subtle: "#2E2008", onSubtle: "#EECF8F" },
  info: { base: "#4CC3DE", onBase: "#062B33", pressed: "#6ED0E6", subtle: "#0A2A32", onSubtle: "#9FDCEB" },
  link: "#7CB5EE",
  focus: "#7CB5EE",
  scrim: "rgba(0,0,0,0.56)",
};

export const colors = { light, dark } as const;
