import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { employees, departments, divisions, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .limit(1);
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, orgRole, userId: clerkUserId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("employees", "edit");
  if (block) return block;
  const isAdmin = orgRole === "org:admin";

  // Detectar si el empleado a editar es el "propio" del usuario logueado.
  // Cualquiera puede modificar SU propia foto; los admins pueden modificar la de cualquiera.
  let isOwnEmployee = false;
  if (!isAdmin && clerkUserId) {
    const userRow = (await db.select().from(users)
      .where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (userRow) {
      const empRow = (await db.select().from(employees)
        .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
        .limit(1))[0];
      if (empRow?.userId === userRow.id) isOwnEmployee = true;
    }
  }
  const canEditImage = isAdmin || isOwnEmployee;

  try {
    const body = await req.json();

    // Construir solo los campos presentes en el body
    const updates: Record<string, unknown> = {};
    if (body.fullName !== undefined) updates.fullName = body.fullName;
    if (body.jobTitle !== undefined) updates.jobTitle = body.jobTitle;
    if (body.description !== undefined) updates.description = body.description;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.salary !== undefined) updates.salary = body.salary;
    if (body.color !== undefined) updates.color = body.color;
    if (body.positionX !== undefined) updates.positionX = body.positionX;
    if (body.positionY !== undefined) updates.positionY = body.positionY;
    if (body.status !== undefined) updates.status = body.status;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.metadata !== undefined) updates.metadata = body.metadata;
    if (body.departmentId !== undefined) updates.departmentId = body.departmentId ?? null;
    if (body.divisionId !== undefined) updates.divisionId = body.divisionId ?? null;
    if (body.managerId !== undefined) updates.managerId = body.managerId ?? null;
    if (body.manualPosition !== undefined) updates.manualPosition = Boolean(body.manualPosition);
    if (body.role !== undefined) updates.role = body.role ?? null;
    if (body.unitId !== undefined) updates.unitId = body.unitId ?? null;
    // imageUrl: cualquiera puede cambiar SU propia foto; los admins pueden cambiar
    // la de cualquier empleado. Si alguien no autorizado lo manda, se ignora silencioso.
    if (body.imageUrl !== undefined && canEditImage) updates.imageUrl = body.imageUrl ?? null;

    const result = await db
      .update(employees)
      .set(updates)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();
    return NextResponse.json(result[0]);
  } catch (err) {
    return apiError(err);
  }
}

// DELETE → elimina el empleado/puesto definitivamente.
// Limpia referencias: headEmployeeId en departments, seniorEmployeeId en divisions.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("employees", "delete");
  if (block) return block;

  try {
    // Limpiar referencias antes de eliminar
    await Promise.all([
      db.update(departments)
        .set({ headEmployeeId: null })
        .where(and(eq(departments.headEmployeeId, id), eq(departments.organizationId, orgId))),
      db.update(divisions)
        .set({ seniorEmployeeId: null })
        .where(and(eq(divisions.seniorEmployeeId, id), eq(divisions.organizationId, orgId))),
      // Desconectar subordinados (que reportaban a este empleado)
      db.update(employees)
        .set({ managerId: null })
        .where(and(eq(employees.managerId, id), eq(employees.organizationId, orgId))),
    ]);

    await db
      .delete(employees)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
