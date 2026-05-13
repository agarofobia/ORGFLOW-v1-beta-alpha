// Sistema de roles de puesto: Director / Manager (Encargado) / Member.
//
// Un empleado puede tener un rol asignado manualmente (override en el modal de edición),
// o dejarlo en null para que se calcule automáticamente desde la estructura jerárquica.
//
// Reglas de auto-detección:
// 1. Si el empleado es headEmployeeId de su departamento → "director".
// 2. Si tiene subordinados (otros empleados con managerId apuntando a él) → "manager".
// 3. Si lidera una unidad (units.headEmployeeId === él) → "manager".
// 4. Resto → "member".

import type { Employee, Unit } from "@/db/schema";
import type { Department } from "./types";

export type EmployeeRole = "director" | "manager" | "member";

export function getEffectiveRole(
  emp: Pick<Employee, "id" | "departmentId" | "role">,
  allEmps: Pick<Employee, "id" | "managerId" | "role">[],
  departments: Pick<Department, "id" | "headEmployeeId">[],
  units: Pick<Unit, "headEmployeeId">[] = [],
): EmployeeRole {
  // Override manual del usuario (si el valor es uno de los 3 válidos)
  if (emp.role === "director" || emp.role === "manager" || emp.role === "member") {
    return emp.role;
  }

  // Auto: ¿es head del departamento?
  const dept = departments.find(d => d.id === emp.departmentId);
  if (dept?.headEmployeeId === emp.id) return "director";

  // Auto: ¿tiene subordinados o lidera una unidad?
  const hasReports = allEmps.some(e => e.managerId === emp.id);
  const leadsUnit = units.some(u => u.headEmployeeId === emp.id);
  if (hasReports || leadsUnit) return "manager";

  return "member";
}

// Label corto para mostrar en badges/UI
export const roleLabel: Record<EmployeeRole, string> = {
  director: "DIR",
  manager: "ENC",
  member: "",
};

// Label largo para selects/formularios
export const roleLabelLong: Record<EmployeeRole, string> = {
  director: "Director",
  manager: "Encargado",
  member: "Miembro",
};
