import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projectMilestones, projects, processInstances } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logActivity } from "@/lib/project-activity";
import { advanceInstance } from "@/lib/bpm";
import { logProcessEvent } from "@/lib/process-events";
import { notify } from "@/lib/notifications";
import { dispatchWebhook } from "@/lib/webhooks";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const { id: projectId, milestoneId } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description ?? null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.orderIndex !== undefined) updates.orderIndex = body.orderIndex;
    if (body.acceptanceCriteria !== undefined) updates.acceptanceCriteria = body.acceptanceCriteria ?? null;
    if (body.ownerEmployeeId !== undefined) updates.ownerEmployeeId = body.ownerEmployeeId ?? null;
    if (body.bpmNodeId !== undefined) updates.bpmNodeId = body.bpmNodeId ?? null;

    const before = (await db.select().from(projectMilestones)
      .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.organizationId, orgId))).limit(1))[0];

    const result = await db
      .update(projectMilestones)
      .set(updates)
      .where(
        and(
          eq(projectMilestones.id, milestoneId),
          eq(projectMilestones.organizationId, orgId)
        )
      )
      .returning();
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const after = result[0];

    // Notificar al nuevo owner si cambió
    if (before && body.ownerEmployeeId !== undefined && before.ownerEmployeeId !== after.ownerEmployeeId && after.ownerEmployeeId) {
      await notify({
        employeeId: after.ownerEmployeeId,
        organizationId: orgId,
        type: "task_assigned",
        title: `Sos owner del hito "${after.title}"`,
        body: after.acceptanceCriteria ?? "",
        linkUrl: `/dashboard/projects?id=${projectId}`,
      });
    }

    // Si se completó: log + BPM reverse trigger (avanzar nodo del proceso si está vinculado)
    let bpmAdvanced = false;
    if (before && body.status !== undefined && before.status !== after.status && after.status === "done") {
      await logActivity({
        projectId, organizationId: orgId, clerkUserId,
        type: "milestone_completed",
        payload: { milestoneId: after.id, title: after.title },
      });
      dispatchWebhook({
        organizationId: orgId,
        eventType: "milestone.completed",
        payload: { milestoneId: after.id, title: after.title, projectId },
      });

      // BPM inverso: si el milestone tiene bpmNodeId Y el proyecto vino de un proceso → avanzar nodo
      if (after.bpmNodeId) {
        const proj = (await db.select({ processInstanceId: projects.processInstanceId })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId))).limit(1))[0];
        if (proj?.processInstanceId) {
          try {
            // Audit: registrar el milestone_linked_completed antes de avanzar
            const [inst] = await db
              .select({ processDefinitionId: processInstances.processDefinitionId })
              .from(processInstances)
              .where(eq(processInstances.id, proj.processInstanceId))
              .limit(1);
            if (inst) {
              await logProcessEvent({
                organizationId: orgId,
                processDefinitionId: inst.processDefinitionId,
                instanceId: proj.processInstanceId,
                nodeId: after.bpmNodeId,
                nodeLabel: after.title,
                event: "milestone_linked_completed",
                clerkUserId,
                metadata: { projectId, milestoneId: after.id, title: after.title },
              });
            }
            const result = await advanceInstance({
              instanceId: proj.processInstanceId,
              completedNodeId: after.bpmNodeId,
              output: { source: "milestone_completed", milestoneId: after.id, title: after.title },
              completedBy: clerkUserId ?? "system",
            });
            bpmAdvanced = result.success;
          } catch (err) {
            console.warn("BPM advance from milestone failed:", String(err));
          }
        }
      }
    }

    return NextResponse.json({ ...after, bpmAdvanced });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const { milestoneId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db
      .delete(projectMilestones)
      .where(
        and(
          eq(projectMilestones.id, milestoneId),
          eq(projectMilestones.organizationId, orgId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
