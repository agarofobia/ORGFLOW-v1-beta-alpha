import { db } from "@/db";
import { processDefinitions, processInstances, inboxTasks } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  assigneeDeptId?: string;
  serviceAction?: string;
  position?: { x: number; y: number };
}

export interface ProcessEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

interface HistoryEntry {
  nodeId: string;
  nodeLabel: string;
  startedAt: string;
  completedAt?: string;
  status: "in_progress" | "completed" | "skipped";
  completedBy?: string;
  output?: Record<string, unknown>;
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(
  condition: string | undefined,
  context: Record<string, unknown>
): boolean {
  if (!condition) return true;
  try {
    const fn = new Function(...Object.keys(context), `return (${condition})`);
    return Boolean(fn(...Object.values(context)));
  } catch {
    return true;
  }
}

// ─── Start instance ───────────────────────────────────────────────────────────

export async function startInstance(opts: {
  processDefinitionId: string;
  organizationId: string;
  startedBy: string;
  context?: Record<string, unknown>;
}): Promise<{ instanceId: string } | { error: string }> {
  const { processDefinitionId, organizationId, startedBy, context = {} } = opts;

  const [definition] = await db
    .select()
    .from(processDefinitions)
    .where(
      and(
        eq(processDefinitions.id, processDefinitionId),
        eq(processDefinitions.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!definition) return { error: "Process not found" };
  if (definition.status !== "active") return { error: "Process is not active" };

  const nodes = definition.nodes as unknown as ProcessNode[];
  const edges = definition.edges as unknown as ProcessEdge[];

  const startNode = nodes.find((n) => n.type === "startEvent");
  if (!startNode) return { error: "Process has no start event" };

  const firstEdge = edges.find((e) => e.from === startNode.id);
  const firstNode = firstEdge ? nodes.find((n) => n.id === firstEdge.to) : null;
  const currentNode = firstNode ?? startNode;

  const now = new Date().toISOString();

  const [instance] = await db
    .insert(processInstances)
    .values({
      organizationId,
      processDefinitionId,
      processName: definition.name,
      currentNodeId: currentNode.id,
      startedBy,
      context,
      history: [
        {
          nodeId: startNode.id,
          nodeLabel: startNode.label,
          startedAt: now,
          completedAt: now,
          status: "completed",
        },
        {
          nodeId: currentNode.id,
          nodeLabel: currentNode.label,
          startedAt: now,
          status: firstNode?.type === "userTask" ? "in_progress" : "completed",
        },
      ],
    })
    .returning();

  if (firstNode?.type === "userTask") {
    await createInboxTask({ instance, node: firstNode, context, definition });
  }

  return { instanceId: instance.id };
}

// ─── Advance instance ─────────────────────────────────────────────────────────

export async function advanceInstance(opts: {
  instanceId: string;
  completedNodeId: string;
  output?: Record<string, unknown>;
  completedBy?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { instanceId, completedNodeId, output = {}, completedBy = "system" } = opts;

  const [instance] = await db
    .select()
    .from(processInstances)
    .where(eq(processInstances.id, instanceId))
    .limit(1);

  if (!instance) return { success: false, error: "Instance not found" };
  if (instance.status !== "running")
    return { success: false, error: `Instance is ${instance.status}` };

  const [definition] = await db
    .select()
    .from(processDefinitions)
    .where(eq(processDefinitions.id, instance.processDefinitionId))
    .limit(1);

  if (!definition) return { success: false, error: "Process definition not found" };

  const nodes = definition.nodes as unknown as ProcessNode[];
  const edges = definition.edges as unknown as ProcessEdge[];
  const history = instance.history as unknown as HistoryEntry[];
  const context = { ...(instance.context as Record<string, unknown>), ...output };
  const now = new Date().toISOString();

  const updatedHistory: HistoryEntry[] = history.map((h) =>
    h.nodeId === completedNodeId && h.status === "in_progress"
      ? { ...h, completedAt: now, completedBy, status: "completed", output }
      : h
  );

  const completedNode = nodes.find((n) => n.id === completedNodeId);
  const outgoingEdges = edges.filter((e) => e.from === completedNodeId);

  // Parallel gateway → follow all outgoing edges
  if (completedNode?.type === "parallelGateway") {
    const parallelEdges = outgoingEdges.filter((e) =>
      evaluateCondition(e.condition, context)
    );
    const nextNodes = parallelEdges
      .map((e) => nodes.find((n) => n.id === e.to))
      .filter(Boolean) as ProcessNode[];

    const newHistoryEntries: HistoryEntry[] = nextNodes.map((n) => ({
      nodeId: n.id,
      nodeLabel: n.label,
      startedAt: now,
      status: n.type === "endEvent" ? "completed" : "in_progress",
    }));

    await db
      .update(processInstances)
      .set({
        currentNodeId: nextNodes[0]?.id ?? completedNodeId,
        context,
        history: [...updatedHistory, ...newHistoryEntries],
      })
      .where(eq(processInstances.id, instanceId));

    for (const node of nextNodes) {
      if (node.type === "userTask") {
        await createInboxTask({ instance, node, context, definition });
      }
    }
    return { success: true };
  }

  // Exclusive gateway or regular node → first matching edge
  const nextEdge = outgoingEdges.find((e) => evaluateCondition(e.condition, context));
  if (!nextEdge) {
    await db
      .update(processInstances)
      .set({ status: "failed", history: updatedHistory })
      .where(eq(processInstances.id, instanceId));
    return { success: false, error: "No matching outgoing edge — process failed" };
  }

  const nextNode = nodes.find((n) => n.id === nextEdge.to);
  if (!nextNode) {
    await db
      .update(processInstances)
      .set({ status: "failed", history: updatedHistory })
      .where(eq(processInstances.id, instanceId));
    return { success: false, error: "Next node not found — process failed" };
  }

  const isEnd = nextNode.type === "endEvent";
  const isService = nextNode.type === "serviceTask" || nextNode.type === "automatedTask";

  const newHistoryEntry: HistoryEntry = {
    nodeId: nextNode.id,
    nodeLabel: nextNode.label,
    startedAt: now,
    completedAt: isEnd || isService ? now : undefined,
    status: isEnd || isService ? "completed" : "in_progress",
  };

  await db
    .update(processInstances)
    .set({
      currentNodeId: nextNode.id,
      status: isEnd ? "completed" : "running",
      completedAt: isEnd ? new Date() : null,
      context,
      history: [...updatedHistory, newHistoryEntry],
    })
    .where(eq(processInstances.id, instanceId));

  if (isEnd) {
    await db
      .update(inboxTasks)
      .set({ status: "skipped" })
      .where(
        and(
          eq(inboxTasks.instanceId, instanceId),
          ne(inboxTasks.status, "completed")
        )
      );
    return { success: true };
  }

  if (nextNode.type === "userTask") {
    await db
      .update(inboxTasks)
      .set({ status: "skipped" })
      .where(
        and(
          eq(inboxTasks.instanceId, instanceId),
          eq(inboxTasks.nodeId, nextNode.id),
          eq(inboxTasks.status, "pending")
        )
      );
    await createInboxTask({ instance, node: nextNode, context, definition });
    return { success: true };
  }

  // Service/automated task → auto-advance
  if (isService && nextNode.serviceAction) {
    return advanceInstance({
      instanceId,
      completedNodeId: nextNode.id,
      output: { [`${nextNode.serviceAction}_executed`]: true },
      completedBy: "system",
    });
  }

  return { success: true };
}

// ─── Create inbox task ────────────────────────────────────────────────────────

async function createInboxTask(opts: {
  instance: { id: string; organizationId: string };
  node: ProcessNode;
  context: Record<string, unknown>;
  definition: { name: string };
}) {
  const { instance, node, context, definition } = opts;
  const priority = (context.priority as string) ?? "medium";

  await db.insert(inboxTasks).values({
    organizationId: instance.organizationId,
    instanceId: instance.id,
    nodeId: node.id,
    nodeLabel: node.label,
    processName: definition.name,
    assignedToDeptId: node.assigneeDeptId ?? null,
    priority: priority as "low" | "medium" | "high" | "critical",
    status: "pending",
    context,
  });
}
