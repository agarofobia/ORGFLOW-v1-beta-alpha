// Resolución de tokens de color del layout a CSS vars del tema (respeta light/dark).
// Compartido por el diseñador (editor + preview) y el runtime (TaskRunnerModal).
import type { ColorToken } from "@/lib/process-types";

export const COLOR_VAR: Record<ColorToken, string> = {
  primary: "var(--c-text-primary)",
  secondary: "var(--c-text-secondary)",
  muted: "var(--c-text-muted)",
  dim: "var(--c-text-dim)",
  blue: "var(--c-accent-blue)",
  emerald: "var(--c-accent-emerald)",
  amber: "var(--c-accent-amber)",
  red: "var(--c-accent-red)",
  violet: "var(--c-accent-violet)",
  cyan: "var(--c-accent-cyan)",
  border: "var(--c-border)",
  borderStrong: "var(--c-border-strong)",
};

// Resuelve un token (o undefined) a una CSS var; si no hay token devuelve fallback.
export function resolveColor(token: ColorToken | undefined, fallback: string): string {
  return token ? (COLOR_VAR[token] ?? fallback) : fallback;
}

// Swatches ofrecidos en el panel de propiedades para texto/título.
export const TEXT_COLOR_SWATCHES: ColorToken[] = ["primary", "secondary", "muted", "blue", "emerald", "amber", "violet"];
// Swatches para divisor.
export const DIVIDER_COLOR_SWATCHES: ColorToken[] = ["border", "borderStrong", "muted", "blue", "violet"];
