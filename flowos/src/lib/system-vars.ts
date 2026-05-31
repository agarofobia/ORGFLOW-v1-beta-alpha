// Catálogo de variables de SISTEMA para tokens dinámicos — módulo PURO (client-safe).
// Token de sistema = `{@...}` (se distingue de los tokens de proceso `{Etiqueta}`).
// El valor real lo resuelve el servidor (ver src/lib/resolve-system-vars.ts) y lo
// manda al runtime; en el editor se usan ejemplos (exampleSystemVars).

export interface SystemVarDef {
  token: string;   // sin llaves, ej "@usuario"
  label: string;   // nombre legible para el menú "Insertar"
}

export const SYSTEM_VARS: SystemVarDef[] = [
  { token: "@hoy", label: "Fecha de hoy" },
  { token: "@ahora", label: "Fecha y hora" },
  { token: "@usuario", label: "Usuario (quien ejecuta)" },
  { token: "@usuario.puesto", label: "Puesto del usuario" },
  { token: "@usuario.area", label: "Área del usuario" },
  { token: "@usuario.email", label: "Email del usuario" },
  { token: "@iniciador", label: "Quien inició la instancia" },
  { token: "@empresa", label: "Empresa" },
];

// Valores de ejemplo para la vista previa del editor (no hay datos reales ahí).
export function exampleSystemVars(): Record<string, string> {
  const now = new Date();
  return {
    "@hoy": now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    "@ahora": now.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    "@usuario": "Ana Torres",
    "@usuario.puesto": "Analista",
    "@usuario.area": "Finanzas",
    "@usuario.email": "ana@empresa.com",
    "@iniciador": "Juan Pérez",
    "@empresa": "Mi Empresa",
  };
}
