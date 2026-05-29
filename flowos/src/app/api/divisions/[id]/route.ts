import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { divisions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name?.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
    if (body.subtitle !== undefined) updates.subtitle = body.subtitle?.trim() || null;
    if (body.footerText !== undefined) updates.footerText = body.footerText?.trim() || null;
    if (body.showFooter !== undefined) updates.showFooter = !!body.showFooter;
    if (body.couplingGroup !== undefined) updates.couplingGroup = body.couplingGroup ?? null;
    if (body.seniorEmployeeId !== undefined) updates.seniorEmployeeId = body.seniorEmployeeId ?? null;
    if (body.isConnectable !== undefined) updates.isConnectable = !!body.isConnectable;
    if (body.color !== undefined) updates.color = body.color;
    if (body.positionX !== undefined) updates.positionX = body.positionX;
    if (body.positionY !== undefined) updates.positionY = body.positionY;
    if (body.sizeWidth !== undefined) updates.sizeWidth = body.sizeWidth;
    if (body.sizeHeight !== undefined) updates.sizeHeight = body.sizeHeight;

    const result = await db
      .update(divisions)
      .set(updates)
      .where(and(eq(divisions.id, id), eq(divisions.organizationId, orgId)))
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

  try {
    const { id } = await params;
    await db
      .delete(divisions)
      .where(and(eq(divisions.id, id), eq(divisions.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
