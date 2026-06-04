import { db } from "@/db";
import {
  processDefinitions, processInstances, inboxTasks,
  projectTemplates, projects, projectMilestones, tasks,
  users, employees,
} from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { logProcessEvent } from "@/lib/process-events";
import { dispatchWebhook } from "@/lib/webhooks";
import { notify } from "@/lib/notifications";
import { resolveSystemVars } from "@/lib/resolve-system-vars";
import { interpolate } from "@/lib/form-conditions";
import type { FormField } from "./process-types";

// ─── Types ────────────────────────────────────────────────────────────────────
// Los tipos puros del dominio (sin deps de DB) viven en `./process-types` para ser
// la única fuente de verdad compartida con el cliente. Acá los re-exportamos para
// no romper imports existentes (`import type { ProcessNode } from "@/lib/bpm"`).
export type {
  FormFieldType,
  FormField,
  LayoutElementKind,
  ConditionOperator,
  ShowWhen,
  LayoutElement,
  ProcessNode,
  ProcessEdge,
  StepAction,
  NotifyConfig,
  TimerConfig,
} from "./process-types";

import type { ProcessNode, ProcessEdge, StepAction, NotifyConfig } from "./process-types";

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
}): Promise<{ instanceId: string; projectId?: string } | { error: string }> {
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

  // Audit: instance started
  await logProcessEvent({
    organizationId,
    processDefinitionId,
    instanceId: instance.id,
    event: "instance_started",
    clerkUserId: startedBy,
    metadata: { processName: definition.name, startNodeId: startNode.id },
  });

  // Webhook outgoing
  dispatchWebhook({
    organizationId,
    eventType: "process.instance_started",
    payload: {
      instanceId: instance.id,
      processDefinitionId,
      processName: definition.name,
      startedBy,
    },
  });

  // Audit: first node entered (si firstNode existe y es distinto del start)
  if (firstNode && firstNode.id !== startNode.id) {
    await logProcessEvent({
      organizationId,
      processDefinitionId,
      instanceId: instance.id,
      nodeId: firstNode.id,
      nodeLabel: firstNode.label,
      event: "node_entered",
      clerkUserId: startedBy,
      metadata: { nodeType: firstNode.type },
    });
  }

  if (firstNode?.type === "userTask") {
    await createInboxTask({ instance, node: firstNode, context, definition });
    await logProcessEvent({
      organizationId,
      processDefinitionId,
      instanceId: instance.id,
      nodeId: firstNode.id,
      nodeLabel: firstNode.label,
      event: "inbox_task_created",
      clerkUserId: startedBy,
      metadata: { assigneeDeptId: firstNode.assigneeDeptId ?? null },
    });
  }

  // Auto-crear proyecto desde template si el proceso lo tiene asociado.
  // Best-effort: si falla, la instancia ya está creada y el resto del proceso sigue.
  let createdProjectId: string | null = null;
  if (definition.projectTemplateId) {
    try {
      createdProjectId = await instantiateProjectFromTemplate({
        templateId: definition.projectTemplateId,
        organizationId,
        processInstanceId: instance.id,
        startedBy,
        nameSuffix: instance.id.slice(0, 8),
      });
      if (createdProjectId) {
        await logProcessEvent({
          organizationId,
          processDefinitionId,
          instanceId: instance.id,
          event: "project_auto_created",
          clerkUserId: startedBy,
          metadata: { projectId: createdProjectId, templateId: definition.projectTemplateId },
        });
      }
    } catch (err) {
      console.warn("Auto-instantiate project from template failed:", String(err));
    }
  }

  return { instanceId: instance.id, projectId: createdProjectId ?? undefined };
}

// ─── Instantiate project from template (BPM trigger) ──────────────────────────
// Versión simplificada del flow de /api/project-templates/[id]/instantiate
// adaptada para uso server-side desde startInstance.

interface TemplateMilestoneShape {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  orderIndex: number;
  dueDateOffsetDays?: number | null;
  tasks?: TemplateTaskShape[];
}
interface TemplateTaskShape {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "in_review" | "done";
  sectionName?: string | null;
}
interface TemplateStructureShape {
  vfp?: Record<string, string> | null;
  milestones?: TemplateMilestoneShape[];
  standaloneTasks?: TemplateTaskShape[];
}

async function instantiateProjectFromTemplate(opts: {
  templateId: string;
  organizationId: string;
  processInstanceId: string;
  startedBy: string;
  nameSuffix?: string;
}): Promise<string | null> {
  const [template] = await db.select().from(projectTemplates)
    .where(and(eq(projectTemplates.id, opts.templateId), eq(projectTemplates.organizationId, opts.organizationId)))
    .limit(1);
  if (!template) return null;

  const structure = (template.structure as TemplateStructureShape) ?? {};
  const startDate = new Date();
  const baseName = opts.nameSuffix ? `${template.name} — ${opts.nameSuffix}` : template.name;

  // 1. Crear proyecto, linkeado a la instancia
  const [project] = await db.insert(projects).values({
    organizationId: opts.organizationId,
    name: baseName,
    description: template.description ?? null,
    vfp: structure.vfp ?? null,
    status: "activo",
    processInstanceId: opts.processInstanceId,
  }).returning();

  // 2. Hitos
  for (const m of (structure.milestones ?? [])) {
    const dueDate = m.dueDateOffsetDays != null
      ? new Date(startDate.getTime() + m.dueDateOffsetDays * 86400000)
      : null;
    const [milestone] = await db.insert(projectMilestones).values({
      projectId: project.id,
      organizationId: opts.organizationId,
      title: m.title,
      description: m.description ?? null,
      acceptanceCriteria: m.acceptanceCriteria ?? null,
      orderIndex: m.orderIndex,
      status: "pending",
      dueDate,
    }).returning();

    // 3. Tareas del hito
    for (const t of (m.tasks ?? [])) {
      await db.insert(tasks).values({
        projectId: project.id,
        organizationId: opts.organizationId,
        title: t.title,
        description: t.description ?? undefined,
        priority: t.priority ?? "medium",
        status: t.status ?? "todo",
        sectionName: t.sectionName ?? "Sin sección",
        milestoneId: milestone.id,
      });
    }
  }

  // 4. Tareas standalone
  for (const t of (structure.standaloneTasks ?? [])) {
    await db.insert(tasks).values({
      projectId: project.id,
      organizationId: opts.organizationId,
      title: t.title,
      description: t.description ?? undefined,
      priority: t.priority ?? "medium",
      status: t.status ?? "todo",
      sectionName: t.sectionName ?? "Sin sección",
    });
  }

  return project.id;
}

// ─── Advance instance ─────────────────────────────────────────────────────────

export async function advanceInstance(opts: {
  instanceId: string;
  completedNodeId: string;
  output?: Record<string, unknown>;
  completedBy?: string;
  // Acción/decisión elegida por el ejecutor (StepAction.id). Modelo híbrido: si la
  // acción tiene `to`, el flujo va directo a ese nodo; si no, sigue por condiciones.
  actionId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { instanceId, completedNodeId, output = {}, completedBy = "system", actionId } = opts;

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

  // Buscar startedAt del nodo recién completado para calcular durationMs
  const completedHistEntry = history.find(
    (h) => h.nodeId === completedNodeId && h.status === "in_progress"
  );
  const completedNodeDurationMs = completedHistEntry
    ? Math.max(0, new Date(now).getTime() - new Date(completedHistEntry.startedAt).getTime())
    : null;

  const updatedHistory: HistoryEntry[] = history.map((h) =>
    h.nodeId === completedNodeId && h.status === "in_progress"
      ? { ...h, completedAt: now, completedBy, status: "completed", output }
      : h
  );

  const completedNode = nodes.find((n) => n.id === completedNodeId);
  const outgoingEdges = edges.filter((e) => e.from === completedNodeId);

  // Acción/decisión elegida (solo userTask con acciones definidas). Guardamos la
  // decisión en el context para que la vean pasos siguientes, texto dinámico y las
  // condiciones de los gateways (modelo híbrido: si la acción tiene `to`, abajo se
  // saltea la evaluación de edges).
  const action = actionId ? completedNode?.actions?.find((a) => a.id === actionId) : undefined;
  if (action) context.decision = action.label;

  // Audit: node completed
  if (completedNode) {
    await logProcessEvent({
      organizationId: instance.organizationId,
      processDefinitionId: instance.processDefinitionId,
      instanceId,
      nodeId: completedNode.id,
      nodeLabel: completedNode.label,
      event: "node_completed",
      clerkUserId: completedBy,
      actorType: completedBy === "system" ? "system" : "user",
      durationMs: completedNodeDurationMs,
      metadata: { nodeType: completedNode.type, output },
    });
  }

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
      await logProcessEvent({
        organizationId: instance.organizationId,
        processDefinitionId: instance.processDefinitionId,
        instanceId,
        nodeId: node.id,
        nodeLabel: node.label,
        event: "node_entered",
        clerkUserId: completedBy,
        actorType: completedBy === "system" ? "system" : "user",
        metadata: { nodeType: node.type, viaGateway: "parallel" },
      });
      if (node.type === "userTask") {
        await createInboxTask({ instance, node, context, definition });
        await logProcessEvent({
          organizationId: instance.organizationId,
          processDefinitionId: instance.processDefinitionId,
          instanceId,
          nodeId: node.id,
          nodeLabel: node.label,
          event: "inbox_task_created",
          clerkUserId: completedBy,
          metadata: { assigneeDeptId: node.assigneeDeptId ?? null },
        });
      }
    }
    return { success: true };
  }

  // Exclusive gateway o nodo regular → HÍBRIDO:
  //  - si la acción elegida define destino directo (`to`), vamos a ese nodo (la
  //    decisión "rompe" el flujo por condiciones);
  //  - si no, seguimos el primer edge cuya condición se cumple (decision ya está
  //    en context, así que las condiciones pueden usarla: `decision === "Rechazar"`).
  let nextNode: ProcessNode | undefined;
  if (action?.to) {
    nextNode = nodes.find((n) => n.id === action.to);
    if (!nextNode) {
      await db
        .update(processInstances)
        .set({ status: "failed", history: updatedHistory })
        .where(eq(processInstances.id, instanceId));
      await logProcessEvent({
        organizationId: instance.organizationId,
        processDefinitionId: instance.processDefinitionId,
        instanceId,
        event: "instance_failed",
        clerkUserId: completedBy,
        actorType: completedBy === "system" ? "system" : "user",
        metadata: { reason: "action target not found", actionId, to: action.to },
      });
      return { success: false, error: "Action target node not found — process failed" };
    }
  } else {
    const nextEdge = outgoingEdges.find((e) => evaluateCondition(e.condition, context));
    if (!nextEdge) {
      await db
        .update(processInstances)
        .set({ status: "failed", history: updatedHistory })
        .where(eq(processInstances.id, instanceId));
      await logProcessEvent({
        organizationId: instance.organizationId,
        processDefinitionId: instance.processDefinitionId,
        instanceId,
        event: "instance_failed",
        clerkUserId: completedBy,
        actorType: completedBy === "system" ? "system" : "user",
        metadata: { reason: "no matching outgoing edge", fromNodeId: completedNodeId },
      });
      return { success: false, error: "No matching outgoing edge — process failed" };
    }
    nextNode = nodes.find((n) => n.id === nextEdge.to);
    if (!nextNode) {
      await db
        .update(processInstances)
        .set({ status: "failed", history: updatedHistory })
        .where(eq(processInstances.id, instanceId));
      await logProcessEvent({
        organizationId: instance.organizationId,
        processDefinitionId: instance.processDefinitionId,
        instanceId,
        event: "instance_failed",
        clerkUserId: completedBy,
        actorType: completedBy === "system" ? "system" : "user",
        metadata: { reason: "next node not found", edgeId: nextEdge.id },
      });
      return { success: false, error: "Next node not found — process failed" };
    }
  }

  const isEnd = nextNode.type === "endEvent";
  const isService = nextNode.type === "serviceTask" || nextNode.type === "automatedTask";
  const isNotify = nextNode.type === "notifyTask";
  const isTimer = nextNode.type === "timerTask";
  // Timer con duración > 0 → la instancia DUERME (history in_progress + resumeAt seteado,
  // el cron la despierta). Timer mal configurado (<=0) → se comporta como auto-avance.
  const timerMs = isTimer ? Math.max(0, nextNode.timer?.durationMs ?? 0) : 0;
  const isSleepingTimer = isTimer && timerMs > 0;
  // Nodos que se completan al instante (no requieren intervención humana ni espera).
  const isAuto = isService || isNotify;
  const completesNow = isEnd || isAuto || (isTimer && !isSleepingTimer);

  const newHistoryEntry: HistoryEntry = {
    nodeId: nextNode.id,
    nodeLabel: nextNode.label,
    startedAt: now,
    completedAt: completesNow ? now : undefined,
    status: completesNow ? "completed" : "in_progress",
  };

  await db
    .update(processInstances)
    .set({
      currentNodeId: nextNode.id,
      status: isEnd ? "completed" : "running",
      completedAt: isEnd ? new Date() : null,
      // Si entramos a un timer dormido → marcamos cuándo despertar; en cualquier otro
      // avance limpiamos resumeAt (incl. cuando el cron reanuda y seguimos a otro nodo).
      resumeAt: isSleepingTimer ? new Date(Date.now() + timerMs) : null,
      context,
      history: [...updatedHistory, newHistoryEntry],
    })
    .where(eq(processInstances.id, instanceId));

  // Audit: node entered (siempre que avancemos a un nuevo nodo)
  await logProcessEvent({
    organizationId: instance.organizationId,
    processDefinitionId: instance.processDefinitionId,
    instanceId,
    nodeId: nextNode.id,
    nodeLabel: nextNode.label,
    event: "node_entered",
    clerkUserId: completedBy,
    actorType: completedBy === "system" ? "system" : "user",
    metadata: { nodeType: nextNode.type, fromNodeId: completedNodeId },
  });

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
    // Total wall-time desde startedAt
    const totalMs = Math.max(
      0,
      new Date().getTime() - new Date(instance.startedAt).getTime()
    );
    await logProcessEvent({
      organizationId: instance.organizationId,
      processDefinitionId: instance.processDefinitionId,
      instanceId,
      nodeId: nextNode.id,
      nodeLabel: nextNode.label,
      event: "instance_completed",
      clerkUserId: completedBy,
      actorType: completedBy === "system" ? "system" : "user",
      durationMs: totalMs,
      metadata: { endNodeId: nextNode.id },
    });
    dispatchWebhook({
      organizationId: instance.organizationId,
      eventType: "process.instance_completed",
      payload: { instanceId, processDefinitionId: instance.processDefinitionId, durationMs: totalMs },
    });
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
    await logProcessEvent({
      organizationId: instance.organizationId,
      processDefinitionId: instance.processDefinitionId,
      instanceId,
      nodeId: nextNode.id,
      nodeLabel: nextNode.label,
      event: "inbox_task_created",
      clerkUserId: completedBy,
      metadata: { assigneeDeptId: nextNode.assigneeDeptId ?? null },
    });
    return { success: true };
  }

  // Timer / Espera → la instancia ya quedó dormida (resumeAt seteado arriba). PARAMOS
  // acá: el cron /api/cron/resume-timers la despertará cuando venza y llamará a
  // advanceInstance(completedNodeId = este timer) para seguir el flujo.
  if (isSleepingTimer) {
    return { success: true };
  }
  // Timer sin duración válida (<=0) → no tiene sentido dormir, avanzamos de una.
  if (isTimer) {
    return advanceInstance({
      instanceId,
      completedNodeId: nextNode.id,
      output: {},
      completedBy: "system",
    });
  }

  // Notificación → ejecuta el aviso y auto-avanza (propaga el actor humano para que
  // {@usuario} en el mensaje sea quien hizo el paso anterior).
  if (isNotify) {
    await executeNotify({ node: nextNode, instance, context, definition, completedBy });
    return advanceInstance({
      instanceId,
      completedNodeId: nextNode.id,
      output: {},
      completedBy,
    });
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

// ─── Ejecutar nodo de notificación ────────────────────────────────────────────

async function resolveRecipients(
  cfg: NotifyConfig,
  instance: { organizationId: string; startedBy: string },
  completedBy: string,
): Promise<{ userId?: string; employeeId?: string }[]> {
  if (cfg.toKind === "initiator" || cfg.toKind === "actor") {
    const clerkId = cfg.toKind === "initiator" ? instance.startedBy : completedBy;
    if (!clerkId || clerkId === "system") return [];
    const u = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1))[0];
    return u ? [{ userId: u.id }] : [];
  }
  // position: "jobTitle" o "jobTitle||personId"
  const [jobTitle, personId] = (cfg.toValue ?? "").split("||");
  if (personId) return [{ employeeId: personId }];
  if (!jobTitle) return [];
  const emps = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.organizationId, instance.organizationId), eq(employees.jobTitle, jobTitle)));
  return emps.map((e) => ({ employeeId: e.id }));
}

async function executeNotify(opts: {
  node: ProcessNode;
  instance: { id: string; organizationId: string; startedBy: string };
  context: Record<string, unknown>;
  definition: { formFields?: unknown };
  completedBy: string;
}) {
  const cfg = opts.node.notify;
  if (!cfg) return;
  try {
    // Tokens del sistema: @usuario = quien hizo el paso anterior, @iniciador = el que arrancó.
    const sysVars = await resolveSystemVars({
      orgId: opts.instance.organizationId,
      viewerClerkId: opts.completedBy && opts.completedBy !== "system" ? opts.completedBy : opts.instance.startedBy,
      initiatorClerkId: opts.instance.startedBy,
    });
    const fields = ((opts.definition.formFields as FormField[]) ?? []).map((f) => ({ id: f.id, label: f.label }));
    const title = interpolate(cfg.subject || opts.node.label, fields, opts.context, sysVars) || opts.node.label;
    const body = interpolate(cfg.message || "", fields, opts.context, sysVars);
    const targets = await resolveRecipients(cfg, opts.instance, opts.completedBy);
    for (const t of targets) {
      await notify({
        userId: t.userId ?? null,
        employeeId: t.employeeId ?? null,
        organizationId: opts.instance.organizationId,
        type: "task_assigned",
        title,
        body,
        email: cfg.email,
        linkUrl: "/dashboard/bandeja",
      });
    }
  } catch (err) {
    console.warn("executeNotify failed:", String(err));
  }
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
