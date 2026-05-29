import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projectMilestones } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logActivity } from "@/lib/project-activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(projectMilestones)
      .where(and(eq(projectMilestones.projectId, projectId), eq(projectMilestones.organizationId, orgId)))
      .orderBy(asc(projectMilestones.orderIndex));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title es requerido" }, { status: 400 });
    }

    // Obtener max orderIndex para este proyecto
    const existing = await db
      .select({ orderIndex: projectMilestones.orderIndex })
      .from(projectMilestones)
      .where(and(eq(projectMilestones.projectId, projectId), eq(projectMilestones.organizationId, orgId)));
    const maxOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex), -1);

    const result = await db
      .insert(projectMilestones)
      .values({
        projectId,
        organizationId: orgId,
        title: body.title.trim(),
        description: body.description?.trim() ?? null,
        orderIndex: maxOrder + 1,
        status: body.status ?? "pending",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        acceptanceCriteria: body.acceptanceCriteria ?? null,
        ownerEmployeeId: body.ownerEmployeeId ?? null,
      })
      .returning();

    if (result[0]) {
      await logActivity({
        projectId, organizationId: orgId, clerkUserId,
        type: "milestone_created",
        payload: { milestoneId: result[0].id, title: result[0].title },
      });
    }

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
