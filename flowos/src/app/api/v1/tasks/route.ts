// GET /api/v1/tasks?projectId=...   — list (read)
// POST /api/v1/tasks                  — create (write)

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireApiToken } from "@/lib/api-token-auth";
import { dispatchWebhook } from "@/lib/webhooks";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");

  try {
    const conditions = [eq(tasks.organizationId, ctx.organizationId)];
    if (projectId) conditions.push(eq(tasks.projectId, projectId));
    const rows = await db.select().from(tasks).where(and(...conditions));
    return NextResponse.json({ tasks: rows });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiToken(req, "write");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;

  try {
    const body = await req.json();
    if (!body.title?.trim() || !body.projectId) {
      return NextResponse.json({ error: "title y projectId requeridos" }, { status: 400 });
    }
    const [created] = await db
      .insert(tasks)
      .values({
        organizationId: ctx.organizationId,
        projectId: body.projectId,
        title: body.title.trim(),
        description: body.description ?? undefined,
        status: body.status ?? "todo",
        priority: body.priority ?? "medium",
        assigneeEmployeeId: body.assigneeEmployeeId ?? null,
        milestoneId: body.milestoneId ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      })
      .returning();

    dispatchWebhook({
      organizationId: ctx.organizationId,
      eventType: "task.created",
      payload: { taskId: created.id, title: created.title, projectId: created.projectId, viaApi: true },
    });

    return NextResponse.json({ task: created }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
