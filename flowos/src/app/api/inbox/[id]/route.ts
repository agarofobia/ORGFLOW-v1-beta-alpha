import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { inboxTasks, processInstances, processDefinitions, documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { advanceInstance } from "@/lib/bpm";
import { logProcessEvent } from "@/lib/process-events";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";
import type { ProcessNode, LayoutElement, FormField } from "@/lib/process-types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [task] = await db
      .select()
      .from(inboxTasks)
      .where(and(eq(inboxTasks.id, id), eq(inboxTasks.organizationId, orgId)))
      .limit(1);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Modelo "tren de carga": los campos del formulario viven a nivel PROCESO
    // (no por nodo). Los valores cargados se acumulan en processInstances.context,
    // así que devolvemos ese context como `fieldValues` para pre-llenar el form con
    // lo que cargaron los pasos anteriores.
    const [instance] = await db
      .select({
        processDefinitionId: processInstances.processDefinitionId,
        context: processInstances.context,
      })
      .from(processInstances)
      .where(eq(processInstances.id, task.instanceId))
      .limit(1);

    let formFields: unknown[] = [];
    let fieldValues: Record<string, unknown> = {};
    let layout: LayoutElement[] = [];
    if (instance) {
      const [def] = await db
        .select({ formFields: processDefinitions.formFields, nodes: processDefinitions.nodes })
        .from(processDefinitions)
        .where(eq(processDefinitions.id, instance.processDefinitionId))
        .limit(1);
      formFields = (def?.formFields as unknown[]) ?? [];
      fieldValues = (instance.context as Record<string, unknown>) ?? {};
      // Layout visual de la ventana de ESTE paso (builder por paso).
      const nodes = (def?.nodes as unknown as ProcessNode[]) ?? [];
      const node = Array.isArray(nodes) ? nodes.find((n) => n.id === task.nodeId) : null;
      layout = node?.layout ?? [];
    }

    return NextResponse.json({ ...task, formFields, fieldValues, layout });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("inbox", "edit");
  if (block) return block;

  try {
    const body = await req.json();
    const action = body.action as "claim" | "complete" | "skip";

    const [task] = await db
      .select()
      .from(inboxTasks)
      .where(and(eq(inboxTasks.id, id), eq(inboxTasks.organizationId, orgId)))
      .limit(1);

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (action === "claim") {
      const [updated] = await db
        .update(inboxTasks)
        .set({ status: "claimed", claimedBy: userId, updatedAt: new Date() })
        .where(eq(inboxTasks.id, id))
        .returning();
      // Audit: claim
      const [inst] = await db
        .select({ processDefinitionId: processInstances.processDefinitionId })
        .from(processInstances)
        .where(eq(processInstances.id, task.instanceId))
        .limit(1);
      if (inst) {
        await logProcessEvent({
          organizationId: orgId,
          processDefinitionId: inst.processDefinitionId,
          instanceId: task.instanceId,
          nodeId: task.nodeId,
          nodeLabel: task.nodeLabel,
          event: "inbox_task_claimed",
          clerkUserId: userId,
          metadata: { inboxTaskId: id },
        });
      }
      return NextResponse.json(updated);
    }

    if (action === "complete") {
      const formData = body.formData ?? {};

      // M8.5 — materializar campos tipo "file" como documentos en Docs.
      // Los formFields ahora viven a nivel proceso (modelo "tren de carga").
      try {
        const [instance] = await db
          .select({ processDefinitionId: processInstances.processDefinitionId })
          .from(processInstances)
          .where(eq(processInstances.id, task.instanceId))
          .limit(1);

        if (instance) {
          const [def] = await db
            .select({ formFields: processDefinitions.formFields })
            .from(processDefinitions)
            .where(eq(processDefinitions.id, instance.processDefinitionId))
            .limit(1);

          if (def) {
            const formFields: FormField[] = (def.formFields as unknown as FormField[]) ?? [];

            for (const field of formFields) {
              if (field.type !== "file") continue;
              const fileVal = formData[field.id] as { name?: string; data?: string; size?: number } | undefined;
              if (!fileVal?.data) continue;

              // Create document record
              const title = fileVal.name ?? field.label ?? "Archivo adjunto";
              await db.insert(documents).values({
                organizationId: orgId,
                title,
                content: {
                  type: "file",
                  fileType: (fileVal.data as string).split(";")[0]?.replace("data:", "") ?? "application/octet-stream",
                  size: fileVal.size ?? 0,
                  data: fileVal.data,
                  ...(field.autoFolder ? { folder: field.autoFolder } : {}),
                },
              });
            }
          }
        }
      } catch {
        // Non-blocking — si falla la materialización, igual completamos la tarea
      }

      await db
        .update(inboxTasks)
        .set({ status: "completed", formData, updatedAt: new Date() })
        .where(eq(inboxTasks.id, id));

      // Audit: inbox task completed (advanceInstance loggea node_completed por separado)
      const [inst2] = await db
        .select({ processDefinitionId: processInstances.processDefinitionId })
        .from(processInstances)
        .where(eq(processInstances.id, task.instanceId))
        .limit(1);
      if (inst2) {
        await logProcessEvent({
          organizationId: orgId,
          processDefinitionId: inst2.processDefinitionId,
          instanceId: task.instanceId,
          nodeId: task.nodeId,
          nodeLabel: task.nodeLabel,
          event: "inbox_task_completed",
          clerkUserId: userId,
          metadata: { inboxTaskId: id, hasFormData: Object.keys(formData).length > 0 },
        });
      }

      const result = await advanceInstance({
        instanceId: task.instanceId,
        completedNodeId: task.nodeId,
        output: { ...formData, ...(body.output ?? {}) },
        completedBy: userId,
      });

      return NextResponse.json({ success: result.success, error: result.error });
    }

    if (action === "skip") {
      const [updated] = await db
        .update(inboxTasks)
        .set({ status: "skipped", updatedAt: new Date() })
        .where(eq(inboxTasks.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return apiError(err);
  }
}
