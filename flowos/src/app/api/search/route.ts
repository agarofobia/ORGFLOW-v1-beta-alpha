// GET /api/search?q=foo
//
// Búsqueda global cross-entidad para el command palette.
// Devuelve hasta 5 hits de cada tipo: proyectos, tareas, empleados, hitos,
// procesos, documentos. Cada hit incluye link de navegación al detalle.
//
// Filtra por organizationId del user actual. No requiere permisos especiales
// más allá de pertenecer a la org — los IDs sueltos no son sensibles.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projects, tasks, employees, projectMilestones, processDefinitions, documents } from "@/db/schema";
import { and, eq, ilike, or, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

const LIMIT_PER_TYPE = 5;

export type SearchHit = {
  type: "project" | "task" | "employee" | "milestone" | "process" | "document";
  id: string;
  label: string;
  hint?: string;
  href: string;
};

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ hits: [] });
  }
  const pattern = `%${q}%`;

  try {
    const [projHits, taskHits, empHits, mileHits, procHits, docHits] = await Promise.all([
      db
        .select({ id: projects.id, name: projects.name, status: projects.status })
        .from(projects)
        .where(and(eq(projects.organizationId, orgId), ilike(projects.name, pattern)))
        .orderBy(desc(projects.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.organizationId, orgId), ilike(tasks.title, pattern)))
        .orderBy(desc(tasks.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({ id: employees.id, fullName: employees.fullName, jobTitle: employees.jobTitle })
        .from(employees)
        .where(and(
          eq(employees.organizationId, orgId),
          or(ilike(employees.fullName, pattern), ilike(employees.jobTitle, pattern))!
        ))
        .limit(LIMIT_PER_TYPE),

      db
        .select({ id: projectMilestones.id, title: projectMilestones.title, projectId: projectMilestones.projectId, status: projectMilestones.status })
        .from(projectMilestones)
        .where(and(eq(projectMilestones.organizationId, orgId), ilike(projectMilestones.title, pattern)))
        .orderBy(desc(projectMilestones.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({ id: processDefinitions.id, name: processDefinitions.name, status: processDefinitions.status })
        .from(processDefinitions)
        .where(and(eq(processDefinitions.organizationId, orgId), ilike(processDefinitions.name, pattern)))
        .orderBy(desc(processDefinitions.createdAt))
        .limit(LIMIT_PER_TYPE),

      db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(and(eq(documents.organizationId, orgId), ilike(documents.title, pattern)))
        .orderBy(desc(documents.createdAt))
        .limit(LIMIT_PER_TYPE),
    ]);

    const hits: SearchHit[] = [
      ...projHits.map<SearchHit>((p) => ({
        type: "project",
        id: p.id,
        label: p.name,
        hint: `Proyecto · ${p.status}`,
        href: `/dashboard/projects?open=${p.id}`,
      })),
      ...taskHits.map<SearchHit>((t) => ({
        type: "task",
        id: t.id,
        label: t.title,
        hint: `Tarea · ${t.status}`,
        href: `/dashboard/projects?open=${t.projectId}&task=${t.id}`,
      })),
      ...empHits.map<SearchHit>((e) => ({
        type: "employee",
        id: e.id,
        label: e.fullName,
        hint: e.jobTitle ?? "Empleado",
        href: `/dashboard/employees?focus=${e.id}`,
      })),
      ...mileHits.map<SearchHit>((m) => ({
        type: "milestone",
        id: m.id,
        label: m.title,
        hint: `Hito · ${m.status}`,
        href: `/dashboard/projects?open=${m.projectId}&milestone=${m.id}`,
      })),
      ...procHits.map<SearchHit>((p) => ({
        type: "process",
        id: p.id,
        label: p.name,
        hint: `Proceso BPM · ${p.status}`,
        href: `/dashboard/processes/${p.id}`,
      })),
      ...docHits.map<SearchHit>((d) => ({
        type: "document",
        id: d.id,
        label: d.title,
        hint: "Documento",
        href: `/dashboard/docs?open=${d.id}`,
      })),
    ];

    return NextResponse.json({ hits });
  } catch (err) {
    return apiError(err);
  }
}
