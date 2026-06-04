// GET /api/cron/resume-timers
//
// Despierta las instancias de proceso dormidas en un nodo `timerTask` cuyo tiempo de
// espera ya venció. Por cada una hace un "claim" atómico (resume_at → null) y llama a
// advanceInstance() para completar el timer y seguir el flujo.
//
// Protección: igual que snapshot-metrics — header `Authorization: Bearer <CRON_SECRET>`
// o ejecución desde Vercel Cron (header `vercel-cron-key`).
//
// Setup en Vercel: vercel.json
//   "crons": [{ "path": "/api/cron/resume-timers", "schedule": "* * * * *" }]
// NOTA: la resolución del timer depende de la frecuencia del cron, que en Vercel
// depende del plan (Hobby = 1×/día; Pro = hasta 1×/min). El motor es agnóstico.

import { db } from "@/db";
import { processInstances } from "@/db/schema";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { advanceInstance } from "@/lib/bpm";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Validación de acceso (mismo patrón que snapshot-metrics)
  const auth = req.headers.get("authorization");
  const cronKey = req.headers.get("vercel-cron-key") ?? req.headers.get("x-vercel-cron");
  const isVercelCron = !!cronKey;
  const isBearer = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
  if (!isVercelCron && !isBearer && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const now = new Date();

    // Instancias dormidas y vencidas: corriendo, con resumeAt seteado y <= ahora.
    const due = await db
      .select({ id: processInstances.id, currentNodeId: processInstances.currentNodeId })
      .from(processInstances)
      .where(
        and(
          eq(processInstances.status, "running"),
          isNotNull(processInstances.resumeAt),
          lte(processInstances.resumeAt, now),
        ),
      );

    const results: Array<{ instanceId: string; ok: boolean; error?: string }> = [];

    for (const inst of due) {
      // Claim atómico: solo procesa quien logra poner resume_at en null. Si otro cron
      // solapado ya lo tomó (resume_at ya null), returning viene vacío → skip.
      const claimed = await db
        .update(processInstances)
        .set({ resumeAt: null })
        .where(and(eq(processInstances.id, inst.id), isNotNull(processInstances.resumeAt)))
        .returning({ id: processInstances.id });
      if (claimed.length === 0) continue;

      try {
        const r = await advanceInstance({
          instanceId: inst.id,
          completedNodeId: inst.currentNodeId,
          completedBy: "system",
        });
        results.push({ instanceId: inst.id, ok: r.success, error: r.error });
      } catch (err) {
        results.push({ instanceId: inst.id, ok: false, error: String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      checkedAt: now.toISOString(),
      due: due.length,
      resumed: results.filter((r) => r.ok).length,
      results,
    });
  } catch (err) {
    return apiError(err);
  }
}
