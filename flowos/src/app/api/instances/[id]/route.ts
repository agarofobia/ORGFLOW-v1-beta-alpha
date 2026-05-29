import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processInstances } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
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
      .from(processInstances)
      .where(and(eq(processInstances.id, id), eq(processInstances.organizationId, orgId)))
      .limit(1);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

// DELETE — cancela/elimina una instancia (cascade elimina inbox_tasks vía FK onDelete: cascade)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db
      .delete(processInstances)
      .where(and(eq(processInstances.id, id), eq(processInstances.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH — actualizar estado (ej: cancelar sin borrar)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;

    // Cargar estado previo para detectar transición real
    const [prev] = await db
      .select()
      .from(processInstances)
      .where(and(eq(processInstances.id, id), eq(processInstances.organizationId, orgId)))
      .limit(1);
    if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [result] = await db
      .update(processInstances)
      .set(updates)
      .where(and(eq(processInstances.id, id), eq(processInstances.organizationId, orgId)))
      .returning();
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Audit: solo si el status cambió a uno terminal/notable
    if (body.status && body.status !== prev.status) {
      const eventByStatus: Record<string, "instance_cancelled" | "instance_paused" | null> = {
        cancelled: "instance_cancelled",
        paused: "instance_paused",
      };
      const evt = eventByStatus[body.status as string] ?? null;
      if (evt) {
        await logProcessEvent({
          organizationId: orgId,
          processDefinitionId: prev.processDefinitionId,
          instanceId: id,
          event: evt,
          clerkUserId: userId,
          metadata: { from: prev.status, to: body.status },
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
