// Tools del asistente IA — formato Vercel AI SDK (con Zod schemas).
//
// Refactor: antes usaba JSONSchema literal porque el código llamaba al SDK de
// Anthropic directo. Ahora usa `tool()` de Vercel AI SDK que normaliza entre
// providers (Claude, Gemini, GPT, Mistral, etc.).
//
// REGLAS (igual que antes):
// - Filtrado por permisos: ALL_TOOLS_FACTORY recibe perms y devuelve solo las
//   tools que el user puede ejecutar.
// - Reads filtran por organizationId.
// - Writes nunca permiten delete.

import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import {
  divisions, departments, employees,
  projects, projectMilestones, tasks,
  processDefinitions,
} from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import type { Module, Action, PermissionsMap } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

// ─── Context ─────────────────────────────────────────────────────────────────

export interface ToolContext {
  orgId: string;
  clerkUserId: string;
  permissions: PermissionsMap;
}

interface ToolMeta {
  requires?: { module: Module; action: Action };
}

const TOOL_META = new Map<string, ToolMeta>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResult(message: string) {
  return { error: message };
}

function requirePerm(name: string, ctx: ToolContext, mod: Module, action: Action) {
  if (!hasPermission(ctx.permissions, mod, action)) {
    return errorResult(
      `Sin permiso para ejecutar ${name} (requiere ${mod}.${action})`
    );
  }
  return null;
}

// ─── Factory que crea las tools con context capturado ───────────────────────

export function buildTools(ctx: ToolContext) {
  const allTools = {
    get_organization_structure: tool({
      description:
        "Devuelve la jerarquía organizacional: divisiones y sus departamentos. " +
        "Usá esto cuando el user mencione 'división X' o 'departamento Y' para resolver IDs.",
      inputSchema: z.object({}),
      execute: async () => {
        const block = requirePerm("get_organization_structure", ctx, "org_chart", "view");
        if (block) return block;
        const divs = await db
          .select({ id: divisions.id, name: divisions.name })
          .from(divisions)
          .where(eq(divisions.organizationId, ctx.orgId));
        const depts = await db
          .select({
            id: departments.id,
            name: departments.name,
            divisionId: departments.divisionId,
          })
          .from(departments)
          .where(eq(departments.organizationId, ctx.orgId));
        return {
          divisions: divs.map((d) => ({
            id: d.id,
            name: d.name,
            departments: depts.filter((dep) => dep.divisionId === d.id).map((dep) => ({ id: dep.id, name: dep.name })),
          })),
          orphanDepartments: depts.filter((d) => !d.divisionId).map((d) => ({ id: d.id, name: d.name })),
        };
      },
    }),

    list_employees: tool({
      description:
        "Lista empleados de la org (puestos ocupados y vacantes) con sus puestos, departamentos y divisiones. " +
        "Soporta filtro opcional por departmentId o búsqueda por nombre.",
      inputSchema: z.object({
        departmentId: z.string().optional().describe("Filtrar a un depto específico"),
        search: z.string().optional().describe("Buscar por nombre o jobTitle"),
        limit: z.number().optional().describe("Máximo de resultados (default 50, max 200)"),
      }),
      execute: async ({ departmentId, search, limit }) => {
        const block = requirePerm("list_employees", ctx, "employees", "view");
        if (block) return block;
        const cap = Math.min(Number(limit ?? 50), 200);
        const conditions = [eq(employees.organizationId, ctx.orgId)];
        if (departmentId) conditions.push(eq(employees.departmentId, departmentId));
        if (search) {
          const q = `%${search}%`;
          conditions.push(or(ilike(employees.fullName, q), ilike(employees.jobTitle, q))!);
        }
        const rows = await db
          .select({
            id: employees.id,
            fullName: employees.fullName,
            jobTitle: employees.jobTitle,
            departmentId: employees.departmentId,
            divisionId: employees.divisionId,
            status: employees.status,
            email: employees.email,
          })
          .from(employees)
          .where(and(...conditions))
          .limit(cap);
        return { employees: rows, total: rows.length };
      },
    }),

    list_projects: tool({
      description:
        "Lista proyectos de la org con su VFP, owner y status. No incluye hitos ni tareas — usá get_project_details para detalle.",
      inputSchema: z.object({
        status: z.string().optional().describe("planning | activo | pausado | completado | cancelado"),
        limit: z.number().optional().describe("Default 30, max 100"),
      }),
      execute: async ({ status, limit }) => {
        const block = requirePerm("list_projects", ctx, "projects", "view");
        if (block) return block;
        const cap = Math.min(Number(limit ?? 30), 100);
        const conditions = [eq(projects.organizationId, ctx.orgId)];
        if (status) conditions.push(eq(projects.status, status));
        const rows = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            status: projects.status,
            vfp: projects.vfp,
            ownerEmployeeId: projects.ownerEmployeeId,
            processInstanceId: projects.processInstanceId,
            createdAt: projects.createdAt,
          })
          .from(projects)
          .where(and(...conditions))
          .limit(cap);
        return { projects: rows, total: rows.length };
      },
    }),

    get_project_details: tool({
      description: "Devuelve un proyecto completo: VFP + hitos + tareas + owner.",
      inputSchema: z.object({
        projectId: z.string().describe("UUID del proyecto"),
      }),
      execute: async ({ projectId }) => {
        const block = requirePerm("get_project_details", ctx, "projects", "view");
        if (block) return block;
        const [project] = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.orgId)))
          .limit(1);
        if (!project) return errorResult("Proyecto no encontrado");
        const milestones = await db
          .select()
          .from(projectMilestones)
          .where(eq(projectMilestones.projectId, projectId));
        const projectTasks = await db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            assigneeEmployeeId: tasks.assigneeEmployeeId,
            milestoneId: tasks.milestoneId,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(eq(tasks.projectId, projectId));
        return { project, milestones, tasks: projectTasks };
      },
    }),

    list_processes: tool({
      description:
        "Lista las definiciones de proceso BPM de la org. Devuelve id, nombre, descripción y status.",
      inputSchema: z.object({}),
      execute: async () => {
        const block = requirePerm("list_processes", ctx, "processes", "view");
        if (block) return block;
        const rows = await db
          .select({
            id: processDefinitions.id,
            name: processDefinitions.name,
            description: processDefinitions.description,
            status: processDefinitions.status,
            category: processDefinitions.category,
          })
          .from(processDefinitions)
          .where(eq(processDefinitions.organizationId, ctx.orgId));
        return { processes: rows };
      },
    }),

    create_project: tool({
      description:
        "Crea un nuevo proyecto con VFP opcional. Si el user menciona división/depto, primero resolvé IDs con get_organization_structure y list_employees.",
      inputSchema: z.object({
        name: z.string().describe("Nombre del proyecto"),
        description: z.string().optional(),
        ownerEmployeeId: z.string().optional().describe("Employee ID del responsable"),
        vfp: z
          .object({
            producto: z.string().optional(),
            para: z.string().optional(),
            quien: z.string().optional(),
            aDiferenciaDe: z.string().optional(),
            terminadoCuando: z.string().optional(),
          })
          .optional()
          .describe("Valuable Final Product"),
        status: z.string().optional().describe("Default 'activo'"),
      }),
      execute: async ({ name, description, ownerEmployeeId, vfp, status }) => {
        const block = requirePerm("create_project", ctx, "projects", "create");
        if (block) return block;
        const [project] = await db
          .insert(projects)
          .values({
            organizationId: ctx.orgId,
            name,
            description: description ?? null,
            vfp: vfp ?? null,
            ownerEmployeeId: ownerEmployeeId ?? null,
            status: status ?? "activo",
          })
          .returning();
        return { project };
      },
    }),

    create_milestone: tool({
      description: "Crea un hito dentro de un proyecto.",
      inputSchema: z.object({
        projectId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        acceptanceCriteria: z.string().optional().describe("Qué define que está terminado"),
        ownerEmployeeId: z.string().optional(),
        dueDate: z.string().optional().describe("ISO 8601"),
        orderIndex: z.number().optional(),
      }),
      execute: async ({ projectId, title, description, acceptanceCriteria, ownerEmployeeId, dueDate, orderIndex }) => {
        const block = requirePerm("create_milestone", ctx, "projects", "edit");
        if (block) return block;
        const [p] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.orgId)))
          .limit(1);
        if (!p) return errorResult("Proyecto no encontrado o de otra org");
        const [milestone] = await db
          .insert(projectMilestones)
          .values({
            projectId,
            organizationId: ctx.orgId,
            title,
            description: description ?? null,
            acceptanceCriteria: acceptanceCriteria ?? null,
            ownerEmployeeId: ownerEmployeeId ?? null,
            dueDate: dueDate ? new Date(dueDate) : null,
            orderIndex: Number(orderIndex ?? 0),
            status: "pending",
          })
          .returning();
        return { milestone };
      },
    }),

    create_task: tool({
      description: "Crea una tarea en un proyecto. Puede asignarse a un empleado y/o vincularse a un hito.",
      inputSchema: z.object({
        projectId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        assigneeEmployeeId: z.string().optional(),
        milestoneId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        dueDate: z.string().optional().describe("ISO 8601"),
      }),
      execute: async ({ projectId, title, description, assigneeEmployeeId, milestoneId, priority, dueDate }) => {
        const block = requirePerm("create_task", ctx, "projects", "edit");
        if (block) return block;
        const [p] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.orgId)))
          .limit(1);
        if (!p) return errorResult("Proyecto no encontrado o de otra org");
        const [task] = await db
          .insert(tasks)
          .values({
            projectId,
            organizationId: ctx.orgId,
            title,
            description: description ?? undefined,
            priority: priority ?? "medium",
            status: "todo",
            assigneeEmployeeId: assigneeEmployeeId ?? null,
            milestoneId: milestoneId ?? null,
            dueDate: dueDate ? new Date(dueDate) : null,
          })
          .returning();
        return { task };
      },
    }),
  };

  // Permission metadata para filtrar tools no permitidas ANTES de mandar al modelo
  TOOL_META.set("get_organization_structure", { requires: { module: "org_chart", action: "view" } });
  TOOL_META.set("list_employees", { requires: { module: "employees", action: "view" } });
  TOOL_META.set("list_projects", { requires: { module: "projects", action: "view" } });
  TOOL_META.set("get_project_details", { requires: { module: "projects", action: "view" } });
  TOOL_META.set("list_processes", { requires: { module: "processes", action: "view" } });
  TOOL_META.set("create_project", { requires: { module: "projects", action: "create" } });
  TOOL_META.set("create_milestone", { requires: { module: "projects", action: "edit" } });
  TOOL_META.set("create_task", { requires: { module: "projects", action: "edit" } });

  return allTools;
}

/**
 * Filtra el objeto de tools devuelto por buildTools() dejando solo las que el
 * user tiene permiso de usar. Esto evita exponer tools al modelo que después
 * van a fallar con "sin permiso".
 */
export function filterToolsByPermissions(
  tools: ReturnType<typeof buildTools>,
  perms: PermissionsMap
): Partial<ReturnType<typeof buildTools>> {
  const filtered: Record<string, unknown> = {};
  for (const [name, toolDef] of Object.entries(tools)) {
    const meta = TOOL_META.get(name);
    if (!meta?.requires || hasPermission(perms, meta.requires.module, meta.requires.action)) {
      filtered[name] = toolDef;
    }
  }
  return filtered as Partial<ReturnType<typeof buildTools>>;
}
