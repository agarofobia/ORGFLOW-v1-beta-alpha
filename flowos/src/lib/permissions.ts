// ─── Permissions — OrgFlow FlowOS ────────────────────────────────────────────
// Sistema de permisos basado en grupos asignables a usuarios, empleados,
// departamentos o divisiones. Cada grupo define qué puede hacer en cada módulo.

export const MODULES = [
  "employees",
  "org_chart",
  "projects",
  "documents",
  "processes",
  "inbox",
  "settings",
  "reports",
] as const;

export type Module = (typeof MODULES)[number];

export const ACTIONS = ["view", "create", "edit", "delete", "manage"] as const;
export type Action = (typeof ACTIONS)[number];

export type ModulePermissions = Partial<Record<Action, boolean>>;
export type PermissionsMap = Partial<Record<Module, ModulePermissions>>;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function hasPermission(
  map: PermissionsMap,
  module: Module,
  action: Action
): boolean {
  return map[module]?.[action] === true;
}

/** OR lógico: si algún mapa concede la acción, el resultado la concede. */
export function mergePermissions(...maps: PermissionsMap[]): PermissionsMap {
  const result: PermissionsMap = {};
  for (const map of maps) {
    for (const mod of MODULES) {
      const src = map[mod];
      if (!src) continue;
      const target = result[mod] ?? {};
      for (const action of ACTIONS) {
        if (src[action]) target[action] = true;
      }
      result[mod] = target;
    }
  }
  return result;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export type PresetKey = "admin" | "manager" | "employee" | "readonly";

export type Preset = {
  name: string;
  description: string;
  modules: PermissionsMap;
};

function allModules(actions: Action[]): PermissionsMap {
  return Object.fromEntries(
    MODULES.map((m) => [m, Object.fromEntries(actions.map((a) => [a, true]))])
  ) as PermissionsMap;
}

export const PRESETS: Record<PresetKey, Preset> = {
  admin: {
    name: "Administrador",
    description: "Acceso completo a todos los módulos.",
    modules: allModules(["view", "create", "edit", "delete", "manage"]),
  },
  manager: {
    name: "Gerente",
    description:
      "Gestión de empleados, proyectos y documentos. Sin acceso a configuración.",
    modules: {
      employees: { view: true, create: true, edit: true },
      org_chart: { view: true, edit: true },
      projects: { view: true, create: true, edit: true },
      documents: { view: true, create: true, edit: true },
      processes: { view: true },
      inbox: { view: true, create: true, edit: true },
      reports: { view: true },
    },
  },
  employee: {
    name: "Empleado",
    description:
      "Vista básica de la organización y gestión de sus propias tareas.",
    modules: {
      employees: { view: true },
      org_chart: { view: true },
      projects: { view: true },
      documents: { view: true },
      inbox: { view: true, edit: true },
    },
  },
  readonly: {
    name: "Solo lectura",
    description: "Puede ver pero no modificar ningún módulo.",
    modules: {
      employees: { view: true },
      org_chart: { view: true },
      projects: { view: true },
      documents: { view: true },
    },
  },
};
