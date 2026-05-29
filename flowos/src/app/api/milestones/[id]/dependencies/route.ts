// GET    /api/milestones/[id]/dependencies      — lista IDs de los milestones de los que depende este
// POST   /api/milestones/[id]/dependencies       — agregar dependencia { dependsOnId }
// DELETE /api/milestones/[id]/dependencies/[depId] — quitar dependencia (otro route)

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { milestoneDependencies, projectMilestones } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db.select().from(milestoneDependencies)
      .where(and(eq(milestoneDependencies.milestoneId, id), eq(milestoneDependencies.organizationId, orgId)));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

// Validación de ciclos: DFS desde el milestone original buscando si dependsOnId
// es alcanzable. Si lo es → crearía ciclo → reject.
async function wouldCreateCycle(orgId: string, milestoneId: string, dependsOnId: string): Promise<boolean> {
  // Buscamos si "milestoneId" es alcanzable empezando desde "dependsOnId"
  // siguiendo sus dependencias. Si llegamos a milestoneId → ciclo.
  const visited = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === milestoneId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await db.select({ dependsOnId: milestoneDependencies.dependsOnId })
      .from(milestoneDependencies)
      .where(and(eq(milestoneDependencies.milestoneId, current), eq(milestoneDependencies.organizationId, orgId)));
    for (const d of deps) stack.push(d.dependsOnId);
  }
  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("projects", "create");
  if (block) return block;

  try {
    const body = await req.json();
    const dependsOnId = String(body.dependsOnId ?? "");
    if (!dependsOnId) return NextResponse.json({ error: "dependsOnId requerido" }, { status: 400 });
    if (dependsOnId === id) return NextResponse.json({ error: "Un hito no puede depender de sí mismo" }, { status: 400 });

    // Verificar ambos milestones existen en la misma org
    const both = await db.select({ id: projectMilestones.id })
      .from(projectMilestones)
      .where(and(eq(projectMilestones.organizationId, orgId)));
    const ids = new Set(both.map(b => b.id));
    if (!ids.has(id) || !ids.has(dependsOnId)) {
      return NextResponse.json({ error: "Hito(s) no encontrado(s)" }, { status: 404 });
    }

    // Detección de ciclos
    if (await wouldCreateCycle(orgId, id, dependsOnId)) {
      return NextResponse.json({ error: "Crearía un ciclo de dependencias" }, { status: 400 });
    }

    const result = await db.insert(milestoneDependencies).values({
      milestoneId: id,
      dependsOnId,
      organizationId: orgId,
    })
      .onConflictDoNothing()
      .returning();
    return NextResponse.json(result[0] ?? { ok: true }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
