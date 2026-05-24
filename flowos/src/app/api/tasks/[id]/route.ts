import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/project-activity";
import { notify } from "@/lib/notifications";
import { dispatchWebhook } from "@/lib/webhooks";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.sectionName !== undefined) updates.sectionName = body.sectionName;
    if (body.assigneeName !== undefined) updates.assigneeName = body.assigneeName;
    if (body.assigneeEmployeeId !== undefined) updates.assigneeEmployeeId = body.assigneeEmployeeId;
    if (body.milestoneId !== undefined) updates.milestoneId = body.milestoneId;

    // Lookup el estado previo para detectar transiciones interesantes (status, assignee)
    const before = (await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId))).limit(1))[0];

    const result = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)))
      .returning();
    const after = result[0];

    // Log activity (best-effort) — solo transiciones relevantes
    if (after && before) {
      if (body.status !== undefined && before.status !== after.status) {
        if (after.status === "done") {
          await logActivity({
            projectId: after.projectId, organizationId: orgId, clerkUserId,
            type: "task_completed", payload: { taskId: after.id, title: after.title },
          });
          dispatchWebhook({
            organizationId: orgId,
            eventType: "task.completed",
            payload: { taskId: after.id, title: after.title, projectId: after.projectId },
          });
        }
        dispatchWebhook({
          organizationId: orgId,
          eventType: "task.status_changed",
          payload: { taskId: after.id, title: after.title, projectId: after.projectId, from: before.status, to: after.status },
        });
      }
      if (body.assigneeEmployeeId !== undefined && before.assigneeEmployeeId !== after.assigneeEmployeeId) {
        await logActivity({
          projectId: after.projectId, organizationId: orgId, clerkUserId,
          type: "task_assigned", payload: {
            taskId: after.id, title: after.title,
            prev: before.assigneeEmployeeId, next: after.assigneeEmployeeId,
            assigneeName: after.assigneeName,
          },
        });
        dispatchWebhook({
          organizationId: orgId,
          eventType: "task.assigned",
          payload: {
            taskId: after.id, title: after.title, projectId: after.projectId,
            assigneeEmployeeId: after.assigneeEmployeeId,
            previousAssigneeEmployeeId: before.assigneeEmployeeId,
          },
        });
        // Notificar al nuevo asignado (si tiene cuenta vinculada)
        if (after.assigneeEmployeeId) {
          await notify({
            employeeId: after.assigneeEmployeeId,
            organizationId: orgId,
            type: "task_assigned",
            title: "Te asignaron una tarea",
            body: after.title,
            linkUrl: `/dashboard/projects?id=${after.projectId}`,
          });
        }
      }
    }

    return NextResponse.json(after);
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
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
