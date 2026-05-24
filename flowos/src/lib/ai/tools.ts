// Tool definitions + executors para el asistente IA.
// Cada tool declara su schema JSON para Anthropic + un executor que valida
// permisos y ejecuta vía Drizzle directo (no llamadas HTTP a la propia app).
//
// REGLAS:
// - Si el user no tiene la permission requerida, el tool ni siquiera se expone
//   a la IA (filtrado en getAvailableTools).
// - Reads son siempre filtrados por organizationId del user.
// - Writes nunca permiten delete. Solo create de cosas nuevas.
// - Errores se devuelven como string al modelo para que pueda recuperarse.

import { db } from "@/db";
import {
  divisions, departments, employees,
  projects, projectMilestones, tasks,
  processDefinitions,
} from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import type { Module, Action, PermissionsMap } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolContext {
  orgId: string;
  clerkUserId: string;
  permissions: PermissionsMap;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  requiresPermission?: { module: Module; action: Action };
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResult(message: string) {
  return { error: message };
}

// ─── Read tools ──────────────────────────────────────────────────────────────

const getOrganizationStructure: ToolDef = {
  name: "get_organization_structure",
  description:
    "Devuelve la jerarquía organizacional: divisiones y sus departamentos. " +
    "Usá esto cuando el user mencione 'división X' o 'departamento Y' para resolver IDs.",
  input_schema: {
    type: "object",
    properties: {},
  },
  requiresPermission: { module: "org_chart", action: "view" },
  execute: async (_input, ctx) => {
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
        departments: depts
          .filter((dep) => dep.divisionId === d.id)
          .map((dep) => ({ id: dep.id, name: dep.name })),
      })),
      orphanDepartments: depts.filter((d) => !d.divisionId).map((d) => ({ id: d.id, name: d.name })),
    };
  },
};

const listEmployees: ToolDef = {
  name: "list_employees",
  description:
    "Lista empleados de la org (puestos ocupados y vacantes) con sus puestos, departamentos y divisiones. " +
    "Soporta filtro opcional por departmentId o búsqueda por nombre.",
  input_schema: {
    type: "object",
    properties: {
      departmentId: { type: "string", description: "Filtrar a un depto específico (opcional)" },
      search: { type: "string", description: "Buscar por nombre o jobTitle (opcional)" },
      limit: { type: "number", description: "Máximo de resultados (default 50, max 200)" },
    },
  },
  requiresPermission: { module: "employees", action: "view" },
  execute: async (input, ctx) => {
    const limit = Math.min(Number(input.limit ?? 50), 200);
    const conditions = [eq(employees.organizationId, ctx.orgId)];
    if (input.departmentId) conditions.push(eq(employees.departmentId, input.departmentId as string));
    if (input.search) {
      const q = `%${input.search as string}%`;
      conditions.push(
        or(ilike(employees.fullName, q), ilike(employees.jobTitle, q))!
      );
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
      .limit(limit);
    return { employees: rows, total: rows.length };
  },
};

const listProjects: ToolDef = {
  name: "list_projects",
  description:
    "Lista proyectos de la org con su VFP, owner y status. No incluye hitos ni tareas — usá get_project para detalle.",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filtrar por status: 'activo' | 'pausado' | 'completado' | 'cancelado' | 'planning'",
      },
      limit: { type: "number", description: "Default 30, max 100" },
    },
  },
  requiresPermission: { module: "projects", action: "view" },
  execute: async (input, ctx) => {
    const limit = Math.min(Number(input.limit ?? 30), 100);
    const conditions = [eq(projects.organizationId, ctx.orgId)];
    if (input.status) conditions.push(eq(projects.status, input.status as string));
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
      .limit(limit);
    return { projects: rows, total: rows.length };
  },
};

const getProjectDetails: ToolDef = {
  name: "get_project_details",
  description: "Devuelve un proyecto completo: VFP + hitos + tareas + owner.",
  input_schema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "UUID del proyecto" },
    },
    required: ["projectId"],
  },
  requiresPermission: { module: "projects", action: "view" },
  execute: async (input, ctx) => {
    const projectId = input.projectId as string;
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
};

const listProcesses: ToolDef = {
  name: "list_processes",
  description:
    "Lista las definiciones de proceso BPM de la org. Devuelve id, nombre, descripción y status (draft/active/archived).",
  input_schema: { type: "object", properties: {} },
  requiresPermission: { module: "processes", action: "view" },
  execute: async (_input, ctx) => {
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
};

// ─── Create tools ────────────────────────────────────────────────────────────

const createProject: ToolDef = {
  name: "create_project",
  description:
    "Crea un nuevo proyecto con VFP opcional. Devuelve el proyecto creado. " +
    "Si el user menciona división/depto, primero llamá get_organization_structure y find_employee para resolver el ownerEmployeeId.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre del proyecto" },
      description: { type: "string", description: "Descripción (opcional)" },
      ownerEmployeeId: { type: "string", description: "Employee ID del responsable (opcional pero recomendado)" },
      vfp: {
        type: "object",
        description: "Valuable Final Product. Cinco campos:",
        properties: {
          producto: { type: "string" },
          para: { type: "string" },
          quien: { type: "string" },
          aDiferenciaDe: { type: "string" },
          terminadoCuando: { type: "string" },
        },
      },
      status: {
        type: "string",
        description: "Default 'activo'. Valores: 'planning' | 'activo' | 'pausado' | 'completado' | 'cancelado'",
      },
    },
    required: ["name"],
  },
  requiresPermission: { module: "projects", action: "create" },
  execute: async (input, ctx) => {
    const [project] = await db
      .insert(projects)
      .values({
        organizationId: ctx.orgId,
        name: input.name as string,
        description: (input.description as string | undefined) ?? null,
        vfp: (input.vfp as Record<string, string> | undefined) ?? null,
        ownerEmployeeId: (input.ownerEmployeeId as string | undefined) ?? null,
        status: (input.status as string | undefined) ?? "activo",
      })
      .returning();
    return { project };
  },
};

const createMilestone: ToolDef = {
  name: "create_milestone",
  description: "Crea un hito dentro de un proyecto. Devuelve el hito creado.",
  input_schema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      acceptanceCriteria: { type: "string", description: "Qué define que está terminado" },
      ownerEmployeeId: { type: "string", description: "Responsable del hito (opcional)" },
      dueDate: { type: "string", description: "Fecha límite ISO 8601 (opcional)" },
      orderIndex: { type: "number", description: "Orden visual (default 0)" },
    },
    required: ["projectId", "title"],
  },
  requiresPermission: { module: "projects", action: "edit" },
  execute: async (input, ctx) => {
    // Verifico que el proyecto sea de esta org
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId as string), eq(projects.organizationId, ctx.orgId)))
      .limit(1);
    if (!p) return errorResult("Proyecto no encontrado o de otra org");

    const [milestone] = await db
      .insert(projectMilestones)
      .values({
        projectId: input.projectId as string,
        organizationId: ctx.orgId,
        title: input.title as string,
        description: (input.description as string | undefined) ?? null,
        acceptanceCriteria: (input.acceptanceCriteria as string | undefined) ?? null,
        ownerEmployeeId: (input.ownerEmployeeId as string | undefined) ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
        orderIndex: Number(input.orderIndex ?? 0),
        status: "pending",
      })
      .returning();
    return { milestone };
  },
};

const createTask: ToolDef = {
  name: "create_task",
  description: "Crea una tarea en un proyecto. Puede asignarse a un empleado y/o vincularse a un hito.",
  input_schema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      assigneeEmployeeId: { type: "string", description: "Employee ID del responsable (opcional)" },
      milestoneId: { type: "string", description: "Hito al que pertenece (opcional)" },
      priority: {
        type: "string",
        description: "low | medium | high | urgent (default medium)",
      },
      dueDate: { type: "string", description: "ISO 8601 (opcional)" },
    },
    required: ["projectId", "title"],
  },
  requiresPermission: { module: "projects", action: "edit" },
  execute: async (input, ctx) => {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId as string), eq(projects.organizationId, ctx.orgId)))
      .limit(1);
    if (!p) return errorResult("Proyecto no encontrado o de otra org");

    const [task] = await db
      .insert(tasks)
      .values({
        projectId: input.projectId as string,
        organizationId: ctx.orgId,
        title: input.title as string,
        description: (input.description as string | undefined) ?? undefined,
        priority: (input.priority as "low" | "medium" | "high" | "urgent" | undefined) ?? "medium",
        status: "todo",
        assigneeEmployeeId: (input.assigneeEmployeeId as string | undefined) ?? null,
        milestoneId: (input.milestoneId as string | undefined) ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
      })
      .returning();
    return { task };
  },
};

// ─── Registry + filtering by permissions ─────────────────────────────────────

export const ALL_TOOLS: ToolDef[] = [
  getOrganizationStructure,
  listEmployees,
  listProjects,
  getProjectDetails,
  listProcesses,
  createProject,
  createMilestone,
  createTask,
];

/** Devuelve solo los tools que el user actual tiene permiso de usar. */
export function getAvailableTools(perms: PermissionsMap): ToolDef[] {
  return ALL_TOOLS.filter((t) => {
    if (!t.requiresPermission) return true;
    return hasPermission(perms, t.requiresPermission.module, t.requiresPermission.action);
  });
}

/** Mapper para el formato que espera Anthropic SDK. */
export function toAnthropicTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as { type: "object"; properties?: Record<string, unknown>; required?: string[] },
  }));
}

/** Ejecutor centralizado: chequea permission, ejecuta, captura errores. */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const tool = ALL_TOOLS.find((t) => t.name === toolName);
  if (!tool) return errorResult(`Tool desconocida: ${toolName}`);
  if (tool.requiresPermission) {
    const ok = hasPermission(ctx.permissions, tool.requiresPermission.module, tool.requiresPermission.action);
    if (!ok) {
      return errorResult(
        `Sin permiso para ejecutar ${toolName} (requiere ${tool.requiresPermission.module}.${tool.requiresPermission.action})`
      );
    }
  }
  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    return errorResult(`Error al ejecutar ${toolName}: ${String(err)}`);
  }
}
