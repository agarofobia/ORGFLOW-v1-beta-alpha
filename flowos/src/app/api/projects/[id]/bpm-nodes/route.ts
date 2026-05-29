// GET /api/projects/[id]/bpm-nodes
// Si el proyecto fue auto-creado por una instancia BPM, devuelve la lista de nodos
// de la definition para poder linkear cada milestone con uno.
// Si el proyecto NO vino de un proceso, devuelve []  (la UI lo trata como "no BPM").

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projects, processInstances, processDefinitions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const project = (await db.select({ processInstanceId: projects.processInstanceId })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.organizationId, orgId))).limit(1))[0];
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!project.processInstanceId) return NextResponse.json({ nodes: [], hasProcess: false });

    const instance = (await db.select({
      processDefinitionId: processInstances.processDefinitionId,
      currentNodeId: processInstances.currentNodeId,
      status: processInstances.status,
    })
      .from(processInstances)
      .where(eq(processInstances.id, project.processInstanceId)).limit(1))[0];
    if (!instance) return NextResponse.json({ nodes: [], hasProcess: false });

    const def = (await db.select({ name: processDefinitions.name, nodes: processDefinitions.nodes })
      .from(processDefinitions)
      .where(eq(processDefinitions.id, instance.processDefinitionId)).limit(1))[0];
    if (!def) return NextResponse.json({ nodes: [], hasProcess: false });

    // Devolver nodos con info simplificada para el picker
    const rawNodes = (def.nodes as Array<{ id: string; label: string; type: string }>) ?? [];
    const nodes = rawNodes
      // Solo nodos accionables (userTask, serviceTask). Eventos de start/end no se "completan".
      .filter(n => n.type === "userTask" || n.type === "serviceTask" || n.type === "task")
      .map(n => ({ id: n.id, label: n.label, type: n.type }));

    return NextResponse.json({
      nodes,
      hasProcess: true,
      processName: def.name,
      currentNodeId: instance.currentNodeId,
      status: instance.status,
    });
  } catch (err) {
    return apiError(err);
  }
}
