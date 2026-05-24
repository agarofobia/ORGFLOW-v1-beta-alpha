// Helper para disparar webhooks salientes.
//
// dispatchWebhook(orgId, eventType, payload):
//   1. Busca subscriptions activas de la org que estén suscritas a este event
//   2. Para cada una: crea una row en webhook_deliveries (pending)
//   3. Hace POST al URL con HMAC-SHA256 signature en el header X-Flowos-Signature
//   4. Actualiza el delivery con status/response
//   5. Best-effort — si la entrega falla, queda registrada pero no rompe la operación principal.

import { db } from "@/db";
import { webhookSubscriptions, webhookDeliveries } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createHmac } from "crypto";

export type WebhookEventType =
  // Tasks
  | "task.created"
  | "task.assigned"
  | "task.completed"
  | "task.status_changed"
  // Projects
  | "project.created"
  | "project.completed"
  | "project.vfp_updated"
  // Milestones
  | "milestone.created"
  | "milestone.completed"
  // BPM
  | "process.instance_started"
  | "process.instance_completed"
  | "process.instance_failed"
  | "process.task_created"
  | "process.task_completed"
  // Employees
  | "employee.created";

export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = [
  "task.created", "task.assigned", "task.completed", "task.status_changed",
  "project.created", "project.completed", "project.vfp_updated",
  "milestone.created", "milestone.completed",
  "process.instance_started", "process.instance_completed", "process.instance_failed",
  "process.task_created", "process.task_completed",
  "employee.created",
];

/**
 * Generar secret aleatorio para una nueva subscription.
 * Formato: `whsec_<32 chars hex>` (similar a Stripe).
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // fallback (node)
    const nodeCrypto = eval("require")("crypto");
    nodeCrypto.randomFillSync(bytes);
  }
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `whsec_${hex}`;
}

/**
 * Firma HMAC-SHA256 del payload. El receiver puede verificar comparando
 * con `createHmac('sha256', secret).update(rawBody).digest('hex')`.
 */
function signPayload(secret: string, body: string, timestamp: string): string {
  const message = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Dispara un evento a todas las subscriptions activas que lo escuchan.
 * No-op silencioso si falla — los webhooks no deben romper la operación principal.
 */
export async function dispatchWebhook(opts: {
  organizationId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const subs = await db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.organizationId, opts.organizationId),
          eq(webhookSubscriptions.active, true),
          // events ARRAY contiene el eventType (Postgres ANY operator)
          sql`${opts.eventType} = ANY(${webhookSubscriptions.events})`
        )
      );

    if (subs.length === 0) return;

    // Disparar en paralelo. No await — fire-and-forget al endpoint del user.
    // Cada uno crea su delivery row independientemente.
    await Promise.all(
      subs.map(async (sub) => {
        const [delivery] = await db
          .insert(webhookDeliveries)
          .values({
            subscriptionId: sub.id,
            organizationId: opts.organizationId,
            eventType: opts.eventType,
            payload: opts.payload,
            status: "pending",
            attempts: 1,
          })
          .returning();

        const body = JSON.stringify({
          event: opts.eventType,
          organizationId: opts.organizationId,
          deliveryId: delivery.id,
          payload: opts.payload,
        });
        const ts = Math.floor(Date.now() / 1000).toString();
        const signature = signPayload(sub.secret, body, ts);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          const res = await fetch(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-FlowOS-Event": opts.eventType,
              "X-FlowOS-Timestamp": ts,
              "X-FlowOS-Signature": `sha256=${signature}`,
              "User-Agent": "FlowOS-Webhooks/1.0",
            },
            body,
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const respText = await res.text().catch(() => "");
          await db
            .update(webhookDeliveries)
            .set({
              status: res.ok ? "success" : "failed",
              responseCode: res.status,
              responseBody: respText.slice(0, 2000),
              deliveredAt: new Date(),
            })
            .where(eq(webhookDeliveries.id, delivery.id));
        } catch (err) {
          await db
            .update(webhookDeliveries)
            .set({
              status: "failed",
              errorMessage: err instanceof Error ? err.message : String(err),
              deliveredAt: new Date(),
            })
            .where(eq(webhookDeliveries.id, delivery.id));
        }
      })
    );
  } catch (err) {
    console.warn("dispatchWebhook failed:", String(err));
  }
}
