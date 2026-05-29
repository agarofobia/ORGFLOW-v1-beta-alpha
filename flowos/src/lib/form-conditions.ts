// Lógica de condiciones de formulario — módulo PURO (sin deps de server/DB).
// Vive separado de bpm.ts porque ese módulo importa `db` (postgres), que no puede
// entrar al bundle del cliente. Acá solo van tipos + funciones puras, usables
// tanto en runtime cliente (TaskRunnerModal) como en el editor.

import type { ShowWhen } from "./bpm";

// Evalúa una condición de visibilidad contra los valores actuales del formulario.
export function evalShowWhen(cond: ShowWhen | undefined, values: Record<string, unknown>): boolean {
  if (!cond) return true; // sin condición → siempre visible
  const raw = values[cond.fieldId];
  const str = raw == null ? "" : String(raw);
  switch (cond.operator) {
    case "isFilled": return str.trim() !== "" && raw !== false;
    case "isEmpty": return str.trim() === "" || raw === false;
    case "equals": return str === (cond.value ?? "");
    case "notEquals": return str !== (cond.value ?? "");
    case "includes": return str.toLowerCase().includes((cond.value ?? "").toLowerCase());
    default: return true;
  }
}
