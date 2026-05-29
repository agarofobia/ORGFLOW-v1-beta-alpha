import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

// PUT /api/employees/:id/vacate
// Vacía el puesto: marca al empleado como inactivo y "[Puesto vacante]",
// pero NO borra el nodo del organigrama (a diferencia de DELETE /employees/:id).
// Mantiene departmentId, divisionId, managerId, color y posición — la estructura
// queda intacta, sólo desaparece la persona.
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("employees", "edit");
  if (block) return block;

  try {
    // El puesto sigue activo (status="active") porque continúa siendo parte
    // de la estructura visible. Sólo se limpia la persona asignada.
    const result = await db
      .update(employees)
      .set({
        fullName: "[Puesto vacante]",
        email: null,
        phone: null,
        salary: null,
        startDate: null,
      })
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    return apiError(err);
  }
}
