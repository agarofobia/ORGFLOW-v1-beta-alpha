// GET /api/processes/[id]/events
//
// Devuelve el audit trail completo del proceso + métricas agregadas (cycle time
// por nodo, throughput, tasa de éxito). Soporta filtros via query string:
//   ?instanceId=...  → solo eventos de una instancia
//   ?event=node_completed → solo un tipo
//   ?limit=200       → cap (default 500)

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processEvents, users } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getUserPermissions } from "@/lib/get-user-permissions";
import { hasPermission } from "@/lib/permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: processDefinitionId } = await params;
  const { orgId, userId, orgRole } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Audit es sensible — solo quien puede crear procesos lo ve
  const perms = await getUserPermissions(orgId, userId, orgRole);
  if (!hasPermission(perms, "processes", "create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("instanceId");
  const eventFilter = url.searchParams.get("event");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);

  try {
    const conditions = [
      eq(processEvents.processDefinitionId, processDefinitionId),
      eq(processEvents.organizationId, orgId),
    ];
    if (instanceId) conditions.push(eq(processEvents.instanceId, instanceId));
    if (eventFilter) conditions.push(eq(processEvents.event, eventFilter));

    const rows = await db
      .select({
        id: processEvents.id,
        instanceId: processEvents.instanceId,
        nodeId: processEvents.nodeId,
        nodeLabel: processEvents.nodeLabel,
        event: processEvents.event,
        actorType: processEvents.actorType,
        actorUserId: processEvents.actorUserId,
        actorName: users.fullName,
        actorEmail: users.email,
        actorImageUrl: users.imageUrl,
        durationMs: processEvents.durationMs,
        metadata: processEvents.metadata,
        createdAt: processEvents.createdAt,
      })
      .from(processEvents)
      .leftJoin(users, eq(processEvents.actorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(processEvents.createdAt))
      .limit(limit);

    // ─── Métricas agregadas ──────────────────────────────────────────────────
    // Solo para la vista "todos los eventos del proceso" (sin filtro instance/event)
    let metrics: {
      totalInstances: number;
      completedInstances: number;
      failedInstances: number;
      cancelledInstances: number;
      successRate: number;
      avgInstanceDurationMs: number | null;
      nodeStats: Array<{
        nodeId: string;
        nodeLabel: string;
        completedCount: number;
        avgDurationMs: number;
        maxDurationMs: number;
      }>;
    } | null = null;

    if (!instanceId && !eventFilter) {
      // Cuento eventos por tipo
      const counts = await db
        .select({
          event: processEvents.event,
          count: sql<number>`count(*)::int`,
        })
        .from(processEvents)
        .where(and(
          eq(processEvents.processDefinitionId, processDefinitionId),
          eq(processEvents.organizationId, orgId),
        ))
        .groupBy(processEvents.event);

      const totalInstances = counts.find(c => c.event === "instance_started")?.count ?? 0;
      const completedInstances = counts.find(c => c.event === "instance_completed")?.count ?? 0;
      const failedInstances = counts.find(c => c.event === "instance_failed")?.count ?? 0;
      const cancelledInstances = counts.find(c => c.event === "instance_cancelled")?.count ?? 0;
      const successRate = totalInstances > 0
        ? Math.round((completedInstances / totalInstances) * 100)
        : 0;

      // Avg instance duration (sobre instance_completed con durationMs)
      const [avgInstance] = await db
        .select({
          avg: sql<number | null>`avg(${processEvents.durationMs})::int`,
        })
        .from(processEvents)
        .where(and(
          eq(processEvents.processDefinitionId, processDefinitionId),
          eq(processEvents.organizationId, orgId),
          eq(processEvents.event, "instance_completed"),
        ));

      // Stats por nodo (cycle time, frecuencia)
      const nodeAgg = await db
        .select({
          nodeId: processEvents.nodeId,
          nodeLabel: processEvents.nodeLabel,
          completedCount: sql<number>`count(*)::int`,
          avgDurationMs: sql<number>`coalesce(avg(${processEvents.durationMs}), 0)::int`,
          maxDurationMs: sql<number>`coalesce(max(${processEvents.durationMs}), 0)::int`,
        })
        .from(processEvents)
        .where(and(
          eq(processEvents.processDefinitionId, processDefinitionId),
          eq(processEvents.organizationId, orgId),
          eq(processEvents.event, "node_completed"),
        ))
        .groupBy(processEvents.nodeId, processEvents.nodeLabel);

      metrics = {
        totalInstances,
        completedInstances,
        failedInstances,
        cancelledInstances,
        successRate,
        avgInstanceDurationMs: avgInstance?.avg ?? null,
        nodeStats: nodeAgg
          .filter(n => n.nodeId)
          .map(n => ({
            nodeId: n.nodeId as string,
            nodeLabel: n.nodeLabel ?? "—",
            completedCount: n.completedCount,
            avgDurationMs: n.avgDurationMs,
            maxDurationMs: n.maxDurationMs,
          }))
          .sort((a, b) => b.avgDurationMs - a.avgDurationMs),
      };
    }

    return NextResponse.json({ events: rows, metrics });
  } catch (err) {
    return apiError(err);
  }
}
