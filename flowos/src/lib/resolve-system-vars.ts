// Resuelve las variables de SISTEMA (server-side) a sus valores reales para una
// ejecución concreta: usuario que ejecuta, quien inició, empresa, fecha.
// El runtime (TaskRunnerModal) recibe este mapa y lo pasa a `interpolate`.
import { db } from "@/db";
import { users, employees, departments, organizations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Resuelve un clerkId → datos del empleado del organigrama (en esta org).
async function employeeOf(clerkId: string | null | undefined, orgId: string) {
  if (!clerkId) return null;
  const [row] = await db
    .select({
      fullName: employees.fullName,
      jobTitle: employees.jobTitle,
      email: employees.email,
      deptName: departments.name,
    })
    .from(users)
    .innerJoin(employees, and(eq(employees.userId, users.id), eq(employees.organizationId, orgId)))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return row ?? null;
}

export async function resolveSystemVars(opts: {
  orgId: string;
  viewerClerkId?: string | null;     // quien está ejecutando el paso
  initiatorClerkId?: string | null;  // quien inició la instancia
}): Promise<Record<string, string>> {
  const { orgId, viewerClerkId, initiatorClerkId } = opts;
  const now = new Date();
  const vars: Record<string, string> = {
    "@hoy": now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    "@ahora": now.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  };

  // Best-effort: si algo falla, dejamos las que pudimos resolver.
  try {
    const [viewer, initiator, org] = await Promise.all([
      employeeOf(viewerClerkId, orgId),
      initiatorClerkId && initiatorClerkId !== viewerClerkId ? employeeOf(initiatorClerkId, orgId) : Promise.resolve(null),
      db.select({ name: organizations.name }).from(organizations).where(eq(organizations.clerkId, orgId)).limit(1),
    ]);

    if (viewer) {
      vars["@usuario"] = viewer.fullName ?? "";
      vars["@usuario.puesto"] = viewer.jobTitle ?? "";
      vars["@usuario.area"] = viewer.deptName ?? "";
      vars["@usuario.email"] = viewer.email ?? "";
    }
    // Si el iniciador es el mismo viewer, reutilizamos.
    const init = initiator ?? (initiatorClerkId && initiatorClerkId === viewerClerkId ? viewer : null);
    if (init) vars["@iniciador"] = init.fullName ?? "";
    if (org[0]?.name) vars["@empresa"] = org[0].name;
  } catch {
    // no-op
  }

  return vars;
}
