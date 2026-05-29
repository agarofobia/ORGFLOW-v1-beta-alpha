// GET /api/webhook-subscriptions   — lista las subscriptions de la org
// POST /api/webhook-subscriptions  — crea una nueva (auto-genera secret)
//
// Permission: requiere settings.manage (admin de la org).

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { webhookSubscriptions, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/require-permission";
import { generateWebhookSecret, ALL_WEBHOOK_EVENTS, type WebhookEventType } from "@/lib/webhooks";

export async function GET() {
  const block = await requirePermission("settings", "view");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select({
        id: webhookSubscriptions.id,
        name: webhookSubscriptions.name,
        url: webhookSubscriptions.url,
        events: webhookSubscriptions.events,
        active: webhookSubscriptions.active,
        createdAt: webhookSubscriptions.createdAt,
        // Secret is NOT returned — solo se ve al crear (one-time-reveal)
      })
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.organizationId, orgId))
      .orderBy(desc(webhookSubscriptions.createdAt));
    return NextResponse.json({ subscriptions: rows, availableEvents: ALL_WEBHOOK_EVENTS });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "name requerido" }, { status: 400 });
    if (!body.url?.trim()) return NextResponse.json({ error: "url requerida" }, { status: 400 });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(body.url.trim());
    } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return NextResponse.json({ error: "URL debe usar http(s)" }, { status: 400 });
    }

    const events = Array.isArray(body.events) ? body.events.filter((e: unknown) =>
      typeof e === "string" && ALL_WEBHOOK_EVENTS.includes(e as WebhookEventType)
    ) : [];

    if (events.length === 0) {
      return NextResponse.json({ error: "Seleccioná al menos un evento" }, { status: 400 });
    }

    // Resolver internal user id
    const u = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    const secret = generateWebhookSecret();

    const [created] = await db
      .insert(webhookSubscriptions)
      .values({
        organizationId: orgId,
        name: body.name.trim(),
        url: body.url.trim(),
        secret,
        events,
        active: true,
        createdByUserId: u?.id ?? null,
      })
      .returning();

    // El secret se devuelve UNA SOLA VEZ al crear. Después solo preview.
    return NextResponse.json({ subscription: created, secret }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
