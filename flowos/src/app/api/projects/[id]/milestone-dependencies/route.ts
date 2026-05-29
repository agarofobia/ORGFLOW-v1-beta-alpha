// GET /api/projects/[id]/milestone-dependencies
// Devuelve TODAS las dependencias entre hitos de este proyecto, para dibujar el DAG/timeline.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { milestoneDependencies, projectMilestones } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ms = await db.select({ id: projectMilestones.id }).from(projectMilestones)
      .where(and(eq(projectMilestones.projectId, projectId), eq(projectMilestones.organizationId, orgId)));
    if (ms.length === 0) return NextResponse.json([]);

    const ids = ms.map(m => m.id);
    const deps = await db.select().from(milestoneDependencies)
      .where(and(
        eq(milestoneDependencies.organizationId, orgId),
        inArray(milestoneDependencies.milestoneId, ids),
      ));
    return NextResponse.json(deps);
  } catch (err) {
    return apiError(err);
  }
}
