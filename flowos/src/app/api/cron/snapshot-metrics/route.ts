// GET /api/cron/snapshot-metrics
//
// Cron diario que captura snapshots de todas las métricas para cada org activa.
// Después de varios días, esos snapshots alimentan los sparklines reales en el dashboard.
//
// Protección: requiere header `Authorization: Bearer <CRON_SECRET>` o ejecuta solo
// desde Vercel Cron (header `vercel-cron-key`).
//
// Setup en Vercel: vercel.json con
//   "crons": [{ "path": "/api/cron/snapshot-metrics", "schedule": "0 3 * * *" }]
// (3am UTC todos los días)

import { db } from "@/db";
import {
  projects, tasks, employees, processDefinitions, processInstances,
  inboxTasks, documents, metricSnapshots, divisions, departments,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Validación de acceso (Vercel Cron sends a specific header)
  const auth = req.headers.get("authorization");
  const cronKey = req.headers.get("vercel-cron-key") ?? req.headers.get("x-vercel-cron");
  const isVercelCron = !!cronKey;
  const isBearer = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
  if (!isVercelCron && !isBearer && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Lista de orgs activas (cualquier org con al menos un proyecto o empleado)
    const orgsRows = await db
      .selectDistinct({ orgId: projects.organizationId })
      .from(projects);
    const empOrgs = await db
      .selectDistinct({ orgId: employees.organizationId })
      .from(employees);
    const allOrgs = new Set<string>([
      ...orgsRows.map((r) => r.orgId),
      ...empOrgs.map((r) => r.orgId),
    ]);

    const inserted: Array<{ org: string; metric: string; value: number }> = [];

    for (const orgId of allOrgs) {
      // Calcular cada métrica
      const [employeesActive] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(eq(employees.organizationId, orgId), eq(employees.status, "active")));

      const [employeesTotal] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(employees)
        .where(eq(employees.organizationId, orgId));

      const [divisionsCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(divisions)
        .where(eq(divisions.organizationId, orgId));

      const [departmentsCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(departments)
        .where(eq(departments.organizationId, orgId));

      const [projectsCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(projects)
        .where(eq(projects.organizationId, orgId));

      const [tasksOpen] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.organizationId, orgId), sql`${tasks.status} != 'done'`));

      const [tasksDone] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.organizationId, orgId), eq(tasks.status, "done")));

      const [processesActive] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(processDefinitions)
        .where(and(eq(processDefinitions.organizationId, orgId), eq(processDefinitions.status, "active")));

      const [instancesRunning] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(processInstances)
        .where(and(eq(processInstances.organizationId, orgId), eq(processInstances.status, "running")));

      const [inboxPending] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(inboxTasks)
        .where(and(eq(inboxTasks.organizationId, orgId), eq(inboxTasks.status, "pending")));

      const [inboxCompleted] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(inboxTasks)
        .where(and(eq(inboxTasks.organizationId, orgId), eq(inboxTasks.status, "completed")));

      const [docsCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.organizationId, orgId));

      const metrics: Array<{ key: string; value: number }> = [
        { key: "employees_active",   value: employeesActive?.c ?? 0 },
        { key: "employees_total",    value: employeesTotal?.c ?? 0 },
        { key: "divisions_count",    value: divisionsCount?.c ?? 0 },
        { key: "departments_count",  value: departmentsCount?.c ?? 0 },
        { key: "projects_count",     value: projectsCount?.c ?? 0 },
        { key: "tasks_open",         value: tasksOpen?.c ?? 0 },
        { key: "tasks_done",         value: tasksDone?.c ?? 0 },
        { key: "processes_active",   value: processesActive?.c ?? 0 },
        { key: "instances_running",  value: instancesRunning?.c ?? 0 },
        { key: "inbox_pending",      value: inboxPending?.c ?? 0 },
        { key: "inbox_completed",    value: inboxCompleted?.c ?? 0 },
        { key: "documents_count",    value: docsCount?.c ?? 0 },
      ];

      // Upsert por (org, date, metric) — la constraint unique evita duplicados
      for (const m of metrics) {
        await db
          .insert(metricSnapshots)
          .values({
            organizationId: orgId,
            snapshotDate: today,
            metricKey: m.key,
            value: m.value,
          })
          .onConflictDoUpdate({
            target: [metricSnapshots.organizationId, metricSnapshots.snapshotDate, metricSnapshots.metricKey],
            set: { value: m.value, createdAt: new Date() },
          });
        inserted.push({ org: orgId, metric: m.key, value: m.value });
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      orgsProcessed: allOrgs.size,
      snapshotsWritten: inserted.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
