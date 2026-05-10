import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name?.trim();
    if (body.divisionId !== undefined) updates.divisionId = body.divisionId ?? null;
    if (body.color !== undefined) updates.color = body.color;
    if (body.positionX !== undefined) updates.positionX = body.positionX;
    if (body.positionY !== undefined) updates.positionY = body.positionY;
    if (body.sizeWidth !== undefined) updates.sizeWidth = body.sizeWidth;
    if (body.sizeHeight !== undefined) updates.sizeHeight = body.sizeHeight;
    if (body.headEmployeeId !== undefined) updates.headEmployeeId = body.headEmployeeId ?? null;

    const result = await db
      .update(departments)
      .set(updates)
      .where(and(eq(departments.id, id), eq(departments.organizationId, orgId)))
      .returning();
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await db
      .delete(departments)
      .where(and(eq(departments.id, id), eq(departments.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
