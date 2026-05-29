// GET /api/metrics/timeseries?metric=tasks_open&days=30
//
// Devuelve la serie temporal de una métrica específica para la org del user.
// Combina snapshots reales (de metric_snapshots) con un valor inicial sintético
// para los días donde todavía no hay snapshot (los días previos al primer cron).

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { metricSnapshots } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const metric = url.searchParams.get("metric");
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 7), 365);
  if (!metric) {
    return NextResponse.json({ error: "metric requerido" }, { status: 400 });
  }

  try {
    const since = new Date(Date.now() - days * 86400000);
    const sinceStr = since.toISOString().slice(0, 10);

    const rows = await db
      .select({ date: metricSnapshots.snapshotDate, value: metricSnapshots.value })
      .from(metricSnapshots)
      .where(and(
        eq(metricSnapshots.organizationId, orgId),
        eq(metricSnapshots.metricKey, metric),
        gte(metricSnapshots.snapshotDate, sinceStr),
      ))
      .orderBy(metricSnapshots.snapshotDate);

    // Devolver el array de { date, value } directamente. El client interpola
    // si hay días faltantes.
    return NextResponse.json({ metric, days, series: rows });
  } catch (err) {
    return apiError(err);
  }
}
