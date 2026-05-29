// GET /api/tasks/[id]/comments  — lista comentarios de la tarea
// POST /api/tasks/[id]/comments — crear comentario (autor = current user)

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { taskComments, tasks, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";
import { logActivity } from "@/lib/project-activity";
import { notify } from "@/lib/notifications";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db.select({
      id: taskComments.id,
      taskId: taskComments.taskId,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      authorUserId: taskComments.authorUserId,
      // Author info joined
      authorClerkId: users.clerkId,
      authorFullName: users.fullName,
      authorEmail: users.email,
      authorImageUrl: users.imageUrl,
    })
      .from(taskComments)
      .leftJoin(users, eq(taskComments.authorUserId, users.id))
      .where(and(eq(taskComments.taskId, id), eq(taskComments.organizationId, orgId)))
      .orderBy(desc(taskComments.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("projects", "create");
  if (block) return block;

  try {
    const body = await req.json();
    const text = String(body.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "body requerido" }, { status: 400 });

    // Validar que la tarea existe + obtener projectId + assignee para notif
    const task = (await db.select({
      id: tasks.id, projectId: tasks.projectId, title: tasks.title,
      assigneeEmployeeId: tasks.assigneeEmployeeId,
    })
      .from(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId))).limit(1))[0];
    if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

    // Resolver users row del autor (auto-provision si no existe)
    let userRow = (await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) {
      const { currentUser } = await import("@clerk/nextjs/server");
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
      const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;
      const inserted = await db.insert(users).values({
        clerkId: clerkUserId, email, fullName, imageUrl: clerkUser?.imageUrl ?? null,
      }).returning();
      userRow = inserted[0];
    }

    const result = await db.insert(taskComments).values({
      taskId: id,
      organizationId: orgId,
      authorUserId: userRow.id,
      body: text,
    }).returning();

    // Log en activity feed
    await logActivity({
      projectId: task.projectId,
      organizationId: orgId,
      clerkUserId,
      type: "comment_added",
      payload: { taskId: id, commentId: result[0].id, preview: text.slice(0, 120) },
    });

    // Notificar al asignado de la tarea (si no es el mismo que comentó)
    if (task.assigneeEmployeeId) {
      await notify({
        employeeId: task.assigneeEmployeeId,
        organizationId: orgId,
        type: "comment_added",
        title: `Nuevo comentario en "${task.title}"`,
        body: text.slice(0, 200),
        linkUrl: `/dashboard/projects?id=${task.projectId}`,
      });
    }

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
