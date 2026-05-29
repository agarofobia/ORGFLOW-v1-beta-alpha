// POST /api/project-templates/[id]/instantiate
// Crea un proyecto nuevo desde el template, incluyendo hitos y tareas.
// Body opcional: { name?, startDate? (ISO) } — name override y due dates se calculan desde startDate.

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  projectTemplates, projects, projectMilestones, tasks, users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logActivity } from "@/lib/project-activity";

interface TemplateMilestone {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  orderIndex: number;
  dueDateOffsetDays?: number | null;
  tasks?: TemplateTask[];
}
interface TemplateTask {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "in_review" | "done";
  sectionName?: string | null;
}
interface TemplateStructure {
  vfp?: Record<string, string> | null;
  milestones?: TemplateMilestone[];
  standaloneTasks?: TemplateTask[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const template = (await db.select().from(projectTemplates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.organizationId, orgId))).limit(1))[0];
    if (!template) return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const projectName = body.name?.trim() || template.name;
    const startDate = body.startDate ? new Date(body.startDate) : new Date();

    // Auto-provision users row
    let userRow = (await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) {
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
      const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;
      const inserted = await db.insert(users).values({
        clerkId: clerkUserId, email, fullName, imageUrl: clerkUser?.imageUrl ?? null,
      }).returning();
      userRow = inserted[0];
    }

    // 1. Crear proyecto
    const structure = (template.structure as TemplateStructure) ?? {};
    const newProject = (await db.insert(projects).values({
      organizationId: orgId,
      name: projectName,
      description: template.description ?? null,
      vfp: structure.vfp ?? null,
      ownerId: userRow.id,
      status: "activo",
    }).returning())[0];

    // 2. Crear hitos
    const milestonesInTemplate = structure.milestones ?? [];
    const insertedMilestones: Array<{ id: string; orderIndex: number }> = [];
    for (const m of milestonesInTemplate) {
      const dueDate = m.dueDateOffsetDays != null
        ? new Date(startDate.getTime() + m.dueDateOffsetDays * 86400000)
        : null;
      const milestoneInserted = (await db.insert(projectMilestones).values({
        projectId: newProject.id,
        organizationId: orgId,
        title: m.title,
        description: m.description ?? null,
        acceptanceCriteria: m.acceptanceCriteria ?? null,
        orderIndex: m.orderIndex,
        status: "pending",
        dueDate,
      }).returning())[0];
      insertedMilestones.push({ id: milestoneInserted.id, orderIndex: m.orderIndex });

      // 3. Crear tareas del hito
      for (const t of (m.tasks ?? [])) {
        await db.insert(tasks).values({
          projectId: newProject.id,
          organizationId: orgId,
          title: t.title,
          description: t.description ?? undefined,
          priority: t.priority ?? "medium",
          status: t.status ?? "todo",
          sectionName: t.sectionName ?? "Sin sección",
          milestoneId: milestoneInserted.id,
        });
      }
    }

    // 4. Tareas standalone (sin hito)
    for (const t of (structure.standaloneTasks ?? [])) {
      await db.insert(tasks).values({
        projectId: newProject.id,
        organizationId: orgId,
        title: t.title,
        description: t.description ?? undefined,
        priority: t.priority ?? "medium",
        status: t.status ?? "todo",
        sectionName: t.sectionName ?? "Sin sección",
      });
    }

    // 5. Log activity
    await logActivity({
      projectId: newProject.id,
      organizationId: orgId,
      clerkUserId,
      type: "task_created",
      payload: { fromTemplate: template.id, templateName: template.name, milestoneCount: insertedMilestones.length },
    });

    return NextResponse.json(newProject, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
