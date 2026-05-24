// Helper para registrar eventos en process_events.
// Audit trail + base para métricas de proceso (cycle time, throughput, bottlenecks).
// No-op silencioso si falla — los eventos son best-effort y no deben romper la ejecución BPM.

import { db } from "@/db";
import { processEvents, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type ProcessEventType =
  | "instance_started"
  | "instance_completed"
  | "instance_failed"
  | "instance_cancelled"
  | "instance_paused"
  | "node_entered"
  | "node_completed"
  | "inbox_task_created"
  | "inbox_task_claimed"
  | "inbox_task_completed"
  | "milestone_linked_completed"
  | "project_auto_created"
  | "definition_published"
  | "definition_archived";

export async function logProcessEvent(opts: {
  organizationId: string;
  processDefinitionId: string;
  instanceId?: string | null;
  nodeId?: string | null;
  nodeLabel?: string | null;
  event: ProcessEventType;
  clerkUserId?: string | null;
  actorType?: "user" | "system";
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    let actorUserId: string | null = null;
    if (opts.clerkUserId && opts.clerkUserId !== "system") {
      const u = (
        await db.select({ id: users.id }).from(users).where(eq(users.clerkId, opts.clerkUserId)).limit(1)
      )[0];
      actorUserId = u?.id ?? null;
    }
    await db.insert(processEvents).values({
      organizationId: opts.organizationId,
      processDefinitionId: opts.processDefinitionId,
      instanceId: opts.instanceId ?? null,
      nodeId: opts.nodeId ?? null,
      nodeLabel: opts.nodeLabel ?? null,
      event: opts.event,
      actorUserId,
      actorType: opts.actorType ?? (opts.clerkUserId === "system" ? "system" : "user"),
      durationMs: opts.durationMs ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch (err) {
    console.warn("process event log failed:", String(err));
  }
}
