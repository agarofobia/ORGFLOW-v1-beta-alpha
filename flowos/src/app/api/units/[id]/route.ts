import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { units, employees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("org_chart", "edit");
  if (block) return block;

  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name?.trim();
    if (body.color !== undefined) updates.color = body.color ?? null;
    if (body.headEmployeeId !== undefined) updates.headEmployeeId = body.headEmployeeId ?? null;
    if (body.positionX !== undefined) updates.positionX = body.positionX;
    if (body.positionY !== undefined) updates.positionY = body.positionY;
    if (body.sizeWidth !== undefined) updates.sizeWidth = body.sizeWidth;
    if (body.sizeHeight !== undefined) updates.sizeHeight = body.sizeHeight;

    const result = await db
      .update(units)
      .set(updates)
      .where(and(eq(units.id, id), eq(units.organizationId, orgId)))
      .returning();
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("org_chart", "delete");
  if (block) return block;

  try {
    const { id } = await params;
    // Limpiar referencias: empleados que estaban en esta unidad quedan sin unit_id.
    await db
      .update(employees)
      .set({ unitId: null })
      .where(and(eq(employees.unitId, id), eq(employees.organizationId, orgId)));
    await db
      .delete(units)
      .where(and(eq(units.id, id), eq(units.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
