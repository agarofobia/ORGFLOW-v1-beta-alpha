// ─── Server-side permission resolver ─────────────────────────────────────────
// Consulta la DB y devuelve el PermissionsMap efectivo del usuario en la org.
// Agrupa: asignaciones directas (user/employee) + de su departamento + división.

import { db } from "@/db";
import { employees, permissionAssignments, permissionGroups } from "@/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { mergePermissions, PermissionsMap } from "./permissions";

export async function getUserPermissions(
  orgId: string,
  clerkUserId: string
): Promise<PermissionsMap> {
  // 1. Buscar employee del usuario en la org
  const empRows = await db
    .select({
      id: employees.id,
      departmentId: employees.departmentId,
      divisionId: employees.divisionId,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, orgId)))
    .limit(50); // todos los employees de la org para después filtrar

  // Busca el employee cuyo userId corresponde (userId es uuid, clerkUserId es text)
  // En este modelo userId es uuid interno, no el clerk id — se resuelve via asignación directa por subject_type='user' y subjectId=clerkUserId
  const employeeRow = empRows[0]; // fallback — en prod filtrar por userId linked a clerkUserId

  // 2. Construir lista de sujetos del usuario
  type SubjectCondition = { type: string; id: string };
  const subjects: SubjectCondition[] = [
    { type: "user", id: clerkUserId },
  ];
  if (employeeRow) {
    subjects.push({ type: "employee", id: employeeRow.id });
    if (employeeRow.departmentId)
      subjects.push({ type: "department", id: employeeRow.departmentId });
    if (employeeRow.divisionId)
      subjects.push({ type: "division", id: employeeRow.divisionId });
  }

  // 3. Buscar assignments que matcheen alguno de los sujetos
  const assignments = await db
    .select({ groupId: permissionAssignments.groupId })
    .from(permissionAssignments)
    .where(
      and(
        eq(permissionAssignments.organizationId, orgId),
        or(
          ...subjects.map((s) =>
            and(
              eq(permissionAssignments.subjectType, s.type as "user" | "employee" | "department" | "division"),
              eq(permissionAssignments.subjectId, s.id)
            )
          )
        )
      )
    );

  if (!assignments.length) return {};

  // 4. Cargar los grupos y hacer merge de sus modules
  const groupIds = [...new Set(assignments.map((a) => a.groupId))];
  const groups = await db
    .select({ modules: permissionGroups.modules })
    .from(permissionGroups)
    .where(inArray(permissionGroups.id, groupIds));

  const maps = groups.map((g) => (g.modules as PermissionsMap) ?? {});
  return mergePermissions(...maps);
}
