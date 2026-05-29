// GET  /api/project-templates       — lista templates de la org
// POST /api/project-templates       — crear template
//   Body: { name, description?, structure?, processDefinitionId?, fromProjectId? }
//   Si pasás fromProjectId, capturamos el snapshot del proyecto (VFP + hitos + tareas) como template.

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  projectTemplates, projects, projectMilestones, tasks, users,
} from "@/db/schema";
import { and, eq, desc, asc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db.select().from(projectTemplates)
      .where(eq(projectTemplates.organizationId, orgId))
      .orderBy(desc(projectTemplates.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "name requerido" }, { status: 400 });

    // Resolver users row (auto-provision)
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

    let structure = body.structure ?? {};

    // Si viene fromProjectId, capturamos el estado actual del proyecto como structure
    if (body.fromProjectId) {
      const proj = (await db.select().from(projects)
        .where(and(eq(projects.id, body.fromProjectId), eq(projects.organizationId, orgId))).limit(1))[0];
      if (!proj) return NextResponse.json({ error: "Proyecto origen no encontrado" }, { status: 404 });

      const mils = await db.select().from(projectMilestones)
        .where(and(eq(projectMilestones.projectId, proj.id), eq(projectMilestones.organizationId, orgId)))
        .orderBy(asc(projectMilestones.orderIndex));

      const allTasks = await db.select().from(tasks)
        .where(and(eq(tasks.projectId, proj.id), eq(tasks.organizationId, orgId)));

      // Calcular due offsets relativos al startDate del proyecto si existe; sino, días desde el primer hito.
      const baseDate = mils[0]?.dueDate ? new Date(mils[0].dueDate) : null;

      structure = {
        vfp: proj.vfp ?? null,
        milestones: mils.map(m => {
          const offsetDays = m.dueDate && baseDate
            ? Math.round((new Date(m.dueDate).getTime() - baseDate.getTime()) / 86400000)
            : null;
          return {
            title: m.title,
            description: m.description,
            acceptanceCriteria: m.acceptanceCriteria,
            orderIndex: m.orderIndex,
            dueDateOffsetDays: offsetDays,
            tasks: allTasks.filter(t => t.milestoneId === m.id).map(t => ({
              title: t.title,
              description: t.description,
              priority: t.priority,
              status: "todo", // siempre arranca como todo al instanciar
              sectionName: t.sectionName,
            })),
          };
        }),
        // Tareas sin hito → quedan como standalone en el template
        standaloneTasks: allTasks.filter(t => !t.milestoneId).map(t => ({
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: "todo",
          sectionName: t.sectionName,
        })),
      };
    }

    const result = await db.insert(projectTemplates).values({
      organizationId: orgId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      structure,
      processDefinitionId: body.processDefinitionId ?? null,
      createdByUserId: userRow.id,
    }).returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
