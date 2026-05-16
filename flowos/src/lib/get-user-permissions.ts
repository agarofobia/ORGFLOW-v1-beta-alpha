// ─── Server-side permission resolver ─────────────────────────────────────────
// Consulta la DB y devuelve el PermissionsMap efectivo del usuario en la org.
// Reglas de resolución:
//  1. org:admin → preset admin completo (sin consultar DB)
//  2. org:member → merge de assignments directos (user/employee/dept/división)

import { db } from "@/db";
import { users, employees, permissionAssignments, permissionGroups } from "@/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { mergePermissions, PRESETS, PermissionsMap } from "./permissions";

export async function getUserPermissions(
  orgId: string,
  clerkUserId: string,
  clerkOrgRole?: string | null
): Promise<PermissionsMap> {
  // 1. org:admin → acceso total inmediato
  if (clerkOrgRole === "org:admin") {
    return PRESETS.admin.modules;
  }

  // 2. Resolver el empleado ligado al usuario de Clerk
  //    Clerk userId → users.clerkId → users.id → employees.userId
  const userRow = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const internalUserId = userRow[0]?.id ?? null;

  // 3. Buscar el empleado activo en la org
  let employeeRow: { id: string; departmentId: string | null; divisionId: string | null } | null = null;
  if (internalUserId) {
    const rows = await db
      .select({
        id: employees.id,
        departmentId: employees.departmentId,
        divisionId: employees.divisionId,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, orgId),
          eq(employees.userId, internalUserId)
        )
      )
      .limit(1);
    employeeRow = rows[0] ?? null;
  }

  // 4. Construir lista de sujetos
  type SubjectCondition = { type: "user" | "employee" | "department" | "division"; id: string };
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

  // 5. Buscar assignments que matcheen alguno de los sujetos
  const assignments = await db
    .select({ groupId: permissionAssignments.groupId })
    .from(permissionAssignments)
    .where(
      and(
        eq(permissionAssignments.organizationId, orgId),
        or(
          ...subjects.map((s) =>
            and(
              eq(permissionAssignments.subjectType, s.type),
              eq(permissionAssignments.subjectId, s.id)
            )
          )
        )
      )
    );

  if (!assignments.length) return {};

  // 6. Cargar los grupos y hacer merge de sus modules
  const groupIds = [...new Set(assignments.map((a) => a.groupId))];
  const groups = await db
    .select({ modules: permissionGroups.modules })
    .from(permissionGroups)
    .where(inArray(permissionGroups.id, groupIds));

  const maps = groups.map((g) => (g.modules as PermissionsMap) ?? {});
  return mergePermissions(...maps);
}
