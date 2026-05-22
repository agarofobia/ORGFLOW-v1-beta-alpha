// GET    /api/project-templates/[id] — detalle (incluye structure completo)
// PUT    /api/project-templates/[id] — actualizar metadata o structure
// DELETE /api/project-templates/[id] — eliminar

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projectTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const row = (await db.select().from(projectTemplates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.organizationId, orgId))).limit(1))[0];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
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
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description ?? null;
    if (body.structure !== undefined) updates.structure = body.structure;
    if (body.processDefinitionId !== undefined) updates.processDefinitionId = body.processDefinitionId ?? null;

    const result = await db.update(projectTemplates).set(updates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.organizationId, orgId)))
      .returning();
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.delete(projectTemplates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.organizationId, orgId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
