import { db } from "@/db";
import {
  processDefinitions, processInstances, inboxTasks,
  projectTemplates, projects, projectMilestones, tasks,
} from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { logProcessEvent } from "@/lib/process-events";
import { dispatchWebhook } from "@/lib/webhooks";

// ─── Types ────────────────────────────────────────────────────────────────────

// Layout visual de la ventana de un paso (builder estilo Canva, por paso).
// Cada elemento se posiciona libre (x,y,w,h) con guías de alineación en el editor.
//  - kind "field":   referencia un campo del proceso (FormField.id). readOnly = solo lectura.
//  - kind "title":   encabezado de texto grande.
//  - kind "text":    subtítulo / texto de ayuda.
//  - kind "divider": separador visual.
// Si un campo NO está en el layout de un paso → no se muestra en ese paso.
export type LayoutElementKind = "field" | "title" | "text" | "divider" | "image" | "section";

// Lógica condicional (mostrar/ocultar por valor). Un elemento con `showWhen`
// solo se renderiza en runtime si la condición se cumple contra los valores
// cargados. Ej: mostrar el campo "detalle" solo si "item" == "otro".
export type ConditionOperator = "equals" | "notEquals" | "includes" | "isFilled" | "isEmpty";

export interface ShowWhen {
  fieldId: string;            // campo del proceso que dispara la condición
  operator: ConditionOperator;
  value?: string;             // valor a comparar (no aplica a isFilled/isEmpty)
}

export interface LayoutElement {
  id: string;                 // id del elemento de layout (no del campo)
  kind: LayoutElementKind;
  fieldId?: string;           // solo kind "field" → apunta a un FormField del proceso
  text?: string;              // kind "title" | "text"
  x: number; y: number;       // posición en px dentro del lienzo
  w: number; h: number;       // tamaño en px
  readOnly?: boolean;         // kind "field": solo lectura en este paso
  fontSize?: number;          // kind "title" | "text"
  align?: "left" | "center" | "right";
  vAlign?: "top" | "middle" | "bottom"; // alineación vertical del texto
  fontFamily?: string;        // tipografía (kind title | text)
  src?: string;               // kind "image" → URL de la imagen
  showWhen?: ShowWhen;        // visibilidad condicional (si está, el elemento es condicional)
}

// La evaluación de condiciones vive en `./form-conditions` (módulo puro, sin deps
// de DB) para que pueda importarse desde componentes cliente sin arrastrar postgres.

export interface ProcessNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  assigneeDeptId?: string;
  serviceAction?: string;
  position?: { x: number; y: number };
  // Layout visual de la ventana de este paso (Fase A — builder por paso).
  layout?: LayoutElement[];
  // SLA: tiempo esperado para completar este nodo en ms.
  // Si la instancia supera este tiempo, se considera "atrasada" (visible en audit).
  // Null = sin SLA definido (no se trackea).
  expectedDurationMs?: number | null;
}

export interface ProcessEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

// ─── Formularios dinámicos (modelo "tren de carga") ───────────────────────────
// Campos compartidos a nivel proceso. Cada instancia acumula sus valores en
// processInstances.context.fieldValues = { [fieldId]: value }.
export type FormFieldType = "text" | "textarea" | "select" | "number" | "date" | "checkbox";

export interface FormField {
  id: string;                 // estable, generado al crear el campo
  label: string;
  type: FormFieldType;
  options?: string[];         // solo para type "select"
  required?: boolean;
  placeholder?: string;
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

  // Exclusive gateway or regular node → first matching edge
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

  const nextNode = nodes.find((n) => n.id === nextEdge.to);
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
