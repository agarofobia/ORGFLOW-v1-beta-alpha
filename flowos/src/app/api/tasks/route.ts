import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";
import { validateBody } from "@/lib/validate";
import { logActivity } from "@/lib/project-activity";
import { dispatchWebhook } from "@/lib/webhooks";
import { z } from "zod";

const taskCreateSchema = z.object({
  projectId: z.string().trim().min(1, "projectId es requerido"),
  title: z.string().trim().min(1, "title es requerido"),
});

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  try {
    let query = db.select().from(tasks).where(eq(tasks.organizationId, orgId));
    if (projectId) {
      query = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.organizationId, orgId), eq(tasks.projectId, projectId)));
    }
    const data = await query;
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("projects", "create");
  if (block) return block;

  try {
    const body = await req.json();
    const v = validateBody(taskCreateSchema, body);
    if ("response" in v) return v.response;
    const result = await db
      .insert(tasks)
      .values({
        projectId: body.projectId,
        organizationId: orgId,
        title: body.title,
        description: body.description,
        status: body.status || "todo",
        priority: body.priority || "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        sectionName: body.sectionName || "Sin sección",
        assigneeName: body.assigneeName,
        assigneeEmployeeId: body.assigneeEmployeeId,
        milestoneId: body.milestoneId,
      })
      .returning();

    // Log activity (best-effort)
    if (result[0]) {
      await logActivity({
        projectId: result[0].projectId,
        organizationId: orgId,
        clerkUserId,
        type: "task_created",
        payload: { taskId: result[0].id, title: result[0].title },
      });
      dispatchWebhook({
        organizationId: orgId,
        eventType: "task.created",
        payload: {
          taskId: result[0].id,
          title: result[0].title,
          projectId: result[0].projectId,
          priority: result[0].priority,
          status: result[0].status,
        },
      });
    }

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
