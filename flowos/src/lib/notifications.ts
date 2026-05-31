// Helper para crear notificaciones in-app + email (opcional, vía Resend).
// Best-effort: si falla, no rompe la operación principal.
//
// Para activar email: setear env vars RESEND_API_KEY + RESEND_FROM_EMAIL.
// Si no están seteadas, el envío de email se skipea silenciosamente.

import { db } from "@/db";
import { notifications, employees, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? "OrgFlow <onboarding@resend.dev>";
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://flowos-delta.vercel.app";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type NotificationType =
  | "task_assigned" | "comment_added" | "milestone_due_soon" | "task_overdue" | "mention";

export async function notify(opts: {
  // Target: o pasás userId (interno) o employeeId (resolvemos su userId)
  userId?: string | null;
  employeeId?: string | null;
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  email?: boolean; // si false, solo in-app (default true → también email si está configurado)
}) {
  try {
    let targetUserId = opts.userId ?? null;

    if (!targetUserId && opts.employeeId) {
      const emp = (await db.select({ userId: employees.userId }).from(employees)
        .where(and(eq(employees.id, opts.employeeId), eq(employees.organizationId, opts.organizationId))).limit(1))[0];
      targetUserId = emp?.userId ?? null;
    }

    if (!targetUserId) return; // sin target válido, no podemos notificar

    // Validar que el user existe + obtener email para envío
    const userRow = (await db.select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users).where(eq(users.id, targetUserId)).limit(1))[0];
    if (!userRow) return;

    // 1. Crear notification in-app
    await db.insert(notifications).values({
      userId: targetUserId,
      organizationId: opts.organizationId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      linkUrl: opts.linkUrl ?? null,
    });

    // 2. Enviar email (best-effort, skipea si no hay Resend configurado o no hay email)
    if (opts.email !== false && resend && userRow.email) {
      try {
        const link = opts.linkUrl ? `${appBaseUrl}${opts.linkUrl}` : appBaseUrl;
        await resend.emails.send({
          from: resendFromEmail,
          to: userRow.email,
          subject: opts.title,
          html: renderEmailHTML({
            recipientName: userRow.fullName ?? userRow.email,
            title: opts.title,
            body: opts.body ?? "",
            linkUrl: link,
          }),
        });
      } catch (emailErr) {
        // Email es opcional, no rompe el flujo si falla
        console.warn("email send failed:", String(emailErr));
      }
    }
  } catch (err) {
    console.warn("notify failed:", String(err));
  }
}

// Template HTML mínimo y limpio para los emails de notificación.
// Estilo inline porque la mayoría de clientes de mail (Gmail mobile, Outlook) no respetan <style>.
function renderEmailHTML(opts: { recipientName: string; title: string; body: string; linkUrl: string }): string {
  const safe = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${safe(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#080B12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#0E1220;border:1px solid #1E2540;border-radius:10px;overflow:hidden;">
    <div style="padding:18px 24px;border-bottom:1px solid #1E2540;background:#080B12;">
      <p style="margin:0;font-size:11px;color:#7A8BAD;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">OrgFlow</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 14px;font-size:13px;color:#7A8BAD;">Hola ${safe(opts.recipientName.split(" ")[0])},</p>
      <h2 style="margin:0 0 12px;font-size:18px;color:#E2E8F8;font-weight:600;line-height:1.35;">${safe(opts.title)}</h2>
      ${opts.body ? `<p style="margin:0 0 18px;font-size:14px;color:#C4CFEA;line-height:1.55;">${safe(opts.body)}</p>` : ""}
      <a href="${opts.linkUrl}" style="display:inline-block;background:#3D7EFF;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Ver en OrgFlow</a>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #1E2540;background:#080B12;">
      <p style="margin:0;font-size:10px;color:#4A5568;line-height:1.5;">
        Recibís este email porque tu cuenta está vinculada a un puesto del organigrama. Para dejar de recibirlos, andá a Configuración → Notificaciones.
      </p>
    </div>
  </div>
</body></html>`;
}
