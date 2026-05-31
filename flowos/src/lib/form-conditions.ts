// Lógica de condiciones de formulario — módulo PURO (sin deps de server/DB).
// Vive separado de bpm.ts porque ese módulo importa `db` (postgres), que no puede
// entrar al bundle del cliente. Acá solo van tipos + funciones puras, usables
// tanto en runtime cliente (TaskRunnerModal) como en el editor.

import type { ShowWhen } from "./process-types";

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

// Texto dinámico: reemplaza tokens `{...}` por su valor. Dos fuentes:
//  - `{@token}` → variable de SISTEMA (systemVars), ej {@usuario}, {@hoy}.
//  - `{Etiqueta}` → campo del PROCESO cuyo label coincide (valor de la instancia).
// Ej: "Hola {Solicitante}, aprobado por {@usuario} el {@hoy}".
// Genérico (no importa FormField) para mantener el módulo puro.
export function interpolate(
  text: string,
  fields: { id: string; label: string }[],
  values: Record<string, unknown>,
  systemVars: Record<string, string> = {},
): string {
  if (!text || !text.includes("{")) return text;
  return text.replace(/\{([^}]+)\}/g, (_m, raw) => {
    const key = String(raw).trim();
    // Variable de sistema
    if (key.startsWith("@")) {
      return key in systemVars ? systemVars[key] : _m;
    }
    // Campo del proceso (por label, case-insensitive)
    const label = key.toLowerCase();
    const field = fields.find((f) => f.label.trim().toLowerCase() === label);
    if (!field) return _m; // no matchea → deja el {texto} literal
    const v = values[field.id];
    if (v == null || v === "") return "";
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
}
