import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { inboxTasks, processInstances, processDefinitions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { advanceInstance } from "@/lib/bpm";
import { NextRequest, NextResponse } from "next/server";
import type { ProcessNode } from "@/lib/bpm";

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

    // Get process definition to extract formFields for this node
    const [instance] = await db
      .select({ processDefinitionId: processInstances.processDefinitionId })
      .from(processInstances)
      .where(eq(processInstances.id, task.instanceId))
      .limit(1);

    let formFields: unknown[] = [];
    if (instance) {
      const [def] = await db
        .select({ nodes: processDefinitions.nodes })
        .from(processDefinitions)
        .where(eq(processDefinitions.id, instance.processDefinitionId))
        .limit(1);
      if (def) {
        const nodes = def.nodes as unknown as ProcessNode[];
        const node = Array.isArray(nodes) ? nodes.find((n) => n.id === task.nodeId) : null;
        formFields = (node as { formFields?: unknown[] } | null)?.formFields ?? [];
      }
    }

    return NextResponse.json({ ...task, formFields });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      return NextResponse.json(updated);
    }

    if (action === "complete") {
      const formData = body.formData ?? {};
      await db
        .update(inboxTasks)
        .set({ status: "completed", formData, updatedAt: new Date() })
        .where(eq(inboxTasks.id, id));

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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
