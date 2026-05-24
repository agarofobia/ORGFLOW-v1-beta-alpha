// PATCH — toggle active / actualizar events / renombrar
// DELETE — eliminar subscription (cascade elimina deliveries)
// GET    — detalle + últimos deliveries

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { webhookSubscriptions, webhookDeliveries } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { ALL_WEBHOOK_EVENTS, type WebhookEventType } from "@/lib/webhooks";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const block = await requirePermission("settings", "view");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const [sub] = await db
      .select({
        id: webhookSubscriptions.id,
        name: webhookSubscriptions.name,
        url: webhookSubscriptions.url,
        events: webhookSubscriptions.events,
        active: webhookSubscriptions.active,
        createdAt: webhookSubscriptions.createdAt,
      })
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.organizationId, orgId)))
      .limit(1);
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const recent = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.subscriptionId, id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(20);

    return NextResponse.json({ subscription: sub, recentDeliveries: recent });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.active === "boolean") updates.active = body.active;
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (Array.isArray(body.events)) {
      const filtered = body.events.filter((e: unknown) =>
        typeof e === "string" && ALL_WEBHOOK_EVENTS.includes(e as WebhookEventType)
      );
      if (filtered.length > 0) updates.events = filtered;
    }
    const [updated] = await db
      .update(webhookSubscriptions)
      .set(updates)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.organizationId, orgId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ subscription: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await db
      .delete(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
