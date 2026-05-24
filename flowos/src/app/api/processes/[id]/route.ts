import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processDefinitions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { logProcessEvent } from "@/lib/process-events";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [data] = await db
      .select()
      .from(processDefinitions)
      .where(
        and(
          eq(processDefinitions.id, id),
          eq(processDefinitions.organizationId, orgId)
        )
      )
      .limit(1);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.status !== undefined) updates.status = body.status;
    if (body.nodes !== undefined) updates.nodes = body.nodes;
    if (body.edges !== undefined) updates.edges = body.edges;
    if ("parentId" in body) updates.parentId = body.parentId; // allow null to move to root
    if ("projectTemplateId" in body) updates.projectTemplateId = body.projectTemplateId; // null permitido para desvincular

    // Estado previo para detectar transición real de status
    const [prev] = await db
      .select({ status: processDefinitions.status })
      .from(processDefinitions)
      .where(and(eq(processDefinitions.id, id), eq(processDefinitions.organizationId, orgId)))
      .limit(1);

    const [result] = await db
      .update(processDefinitions)
      .set(updates)
      .where(
        and(
          eq(processDefinitions.id, id),
          eq(processDefinitions.organizationId, orgId)
        )
      )
      .returning();
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Audit: definition_published / definition_archived
    if (prev && body.status && body.status !== prev.status) {
      const evt =
        body.status === "active"
          ? "definition_published"
          : body.status === "archived"
          ? "definition_archived"
          : null;
      if (evt) {
        await logProcessEvent({
          organizationId: orgId,
          processDefinitionId: id,
          event: evt,
          clerkUserId: userId,
          metadata: { from: prev.status, to: body.status },
        });
      }
    }

    return NextResponse.json(result);
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
    await db
      .delete(processDefinitions)
      .where(
        and(
          eq(processDefinitions.id, id),
          eq(processDefinitions.organizationId, orgId)
        )
      );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
