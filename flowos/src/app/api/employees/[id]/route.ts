import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const result = await db
      .update(employees)
      .set(updates)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();
    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE → archiva (status = inactive) en lugar de eliminar
// El nodo del organigrama queda intacto con el puesto vacío
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await db
      .update(employees)
      .set({ status: "inactive", fullName: "[Puesto vacante]" })
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();
    return NextResponse.json({ success: true, archived: result[0] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
