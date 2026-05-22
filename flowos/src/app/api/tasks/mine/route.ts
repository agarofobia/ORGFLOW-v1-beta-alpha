// GET /api/tasks/mine
// Devuelve todas las tareas asignadas al employee del usuario actual, cross-project.
// Sumamos project info para que el frontend pueda linkear / mostrar contexto.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, employees, tasks, projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Resolver employee del current user
    const userRow = (await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) return NextResponse.json({ tasks: [], employee: null });

    const empRow = (await db.select().from(employees)
      .where(and(eq(employees.organizationId, orgId), eq(employees.userId, userRow.id)))
      .limit(1))[0];
    if (!empRow) return NextResponse.json({ tasks: [], employee: null });

    // 2. Tareas asignadas a ese employee, cross-project, con info de proyecto
    const rows = await db.select({
      // task fields
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      sectionName: tasks.sectionName,
      milestoneId: tasks.milestoneId,
      assigneeEmployeeId: tasks.assigneeEmployeeId,
      assigneeName: tasks.assigneeName,
      createdAt: tasks.createdAt,
      // project fields (joined)
      projectName: projects.name,
    })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(tasks.organizationId, orgId),
        eq(tasks.assigneeEmployeeId, empRow.id),
      ));

    return NextResponse.json({ tasks: rows, employee: empRow });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
