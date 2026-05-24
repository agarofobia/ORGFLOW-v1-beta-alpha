// MCP Server endpoint para FlowOS
// ================================
// Implementación mínima de Model Context Protocol (HTTP transport)
// que expone tools de FlowOS para que Claude Desktop / Cursor / Windsurf /
// cualquier MCP client pueda conectar.
//
// Auth: API token via Authorization: Bearer flo_... (mismo que /api/v1/*)
//
// Endpoint: POST /api/mcp
// Body: JSON-RPC 2.0 message
// Response: JSON-RPC 2.0 response

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiToken } from "@/lib/api-token-auth";
import { db } from "@/db";
import { projects, tasks, employees, projectMilestones, processDefinitions, divisions, departments } from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { startInstance } from "@/lib/bpm";

// ─── Tool definitions en formato MCP ────────────────────────────────────────

const TOOLS = [
  {
    name: "list_projects",
    description: "Lista los proyectos de la organización",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filtrar por status" },
      },
    },
  },
  {
    name: "create_project",
    description: "Crea un nuevo proyecto con VFP opcional",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        vfp: { type: "object" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_tasks",
    description: "Lista tareas, opcionalmente filtradas por proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
    },
  },
  {
    name: "create_task",
    description: "Crea una tarea en un proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      },
      required: ["projectId", "title"],
    },
  },
  {
    name: "list_employees",
    description: "Lista empleados con sus puestos",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Buscar por nombre o jobTitle" },
      },
    },
  },
  {
    name: "get_orgchart",
    description: "Devuelve la estructura organizacional (divisiones + departamentos)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_processes",
    description: "Lista definiciones BPM",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "start_process_instance",
    description: "Inicia una instancia de un proceso BPM",
    inputSchema: {
      type: "object",
      properties: {
        processId: { type: "string" },
        context: { type: "object" },
      },
      required: ["processId"],
    },
  },
];

// ─── Tool executors ──────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: string,
  tokenId: string
): Promise<unknown> {
  switch (toolName) {
    case "list_projects": {
      const conditions = [eq(projects.organizationId, orgId)];
      if (args.status) conditions.push(eq(projects.status, args.status as string));
      const rows = await db.select().from(projects).where(and(...conditions));
      return { projects: rows };
    }
    case "create_project": {
      const [created] = await db
        .insert(projects)
        .values({
          organizationId: orgId,
          name: args.name as string,
          description: (args.description as string | undefined) ?? null,
          vfp: (args.vfp as Record<string, unknown> | undefined) ?? null,
          status: "activo",
        })
        .returning();
      return { project: created };
    }
    case "list_tasks": {
      const conditions = [eq(tasks.organizationId, orgId)];
      if (args.projectId) conditions.push(eq(tasks.projectId, args.projectId as string));
      const rows = await db.select().from(tasks).where(and(...conditions));
      return { tasks: rows };
    }
    case "create_task": {
      const [created] = await db
        .insert(tasks)
        .values({
          organizationId: orgId,
          projectId: args.projectId as string,
          title: args.title as string,
          description: (args.description as string | undefined) ?? undefined,
          priority: (args.priority as "low" | "medium" | "high" | "urgent" | undefined) ?? "medium",
          status: "todo",
        })
        .returning();
      return { task: created };
    }
    case "list_employees": {
      const conditions = [eq(employees.organizationId, orgId)];
      if (args.search) {
        const q = `%${args.search}%`;
        conditions.push(or(ilike(employees.fullName, q), ilike(employees.jobTitle, q))!);
      }
      const rows = await db.select().from(employees).where(and(...conditions));
      return { employees: rows };
    }
    case "get_orgchart": {
      const [divs, depts] = await Promise.all([
        db.select().from(divisions).where(eq(divisions.organizationId, orgId)),
        db.select().from(departments).where(eq(departments.organizationId, orgId)),
      ]);
      return {
        divisions: divs.map((d) => ({
          id: d.id,
          name: d.name,
          departments: depts.filter((dep) => dep.divisionId === d.id).map((dep) => ({ id: dep.id, name: dep.name })),
        })),
      };
    }
    case "list_processes": {
      const rows = await db
        .select({
          id: processDefinitions.id,
          name: processDefinitions.name,
          status: processDefinitions.status,
        })
        .from(processDefinitions)
        .where(eq(processDefinitions.organizationId, orgId));
      return { processes: rows };
    }
    case "start_process_instance": {
      const result = await startInstance({
        processDefinitionId: args.processId as string,
        organizationId: orgId,
        startedBy: `mcp-token:${tokenId}`,
        context: (args.context as Record<string, unknown> | undefined) ?? {},
      });
      return result;
    }
    default:
      throw new Error(`Tool desconocida: ${toolName}`);
  }
}

// ─── JSON-RPC 2.0 handler ────────────────────────────────────────────────────

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export async function GET() {
  // Discovery endpoint — devuelve info del server sin requerir auth
  return NextResponse.json({
    name: "flowos-mcp",
    version: "1.0.0",
    protocol: "mcp",
    description: "FlowOS MCP server — herramientas BPM/ERP correlacional",
    authRequired: true,
    authMethod: "Bearer token (API token de FlowOS)",
    docsUrl: "/dashboard/settings",
    transport: "http",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}

export async function POST(req: NextRequest) {
  // Auth con API token
  const ctx = await authenticateApiToken(req);
  if (!ctx) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized — pass Authorization: Bearer flo_..." },
      } satisfies RpcResponse,
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as RpcRequest;
    const { method, params, id } = body;

    if (method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "flowos-mcp", version: "1.0.0" },
        },
      } satisfies RpcResponse);
    }

    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      } satisfies RpcResponse);
    }

    if (method === "tools/call") {
      const toolName = params?.name as string;
      const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (!toolName) {
        return NextResponse.json({
          jsonrpc: "2.0", id,
          error: { code: -32602, message: "Falta params.name" },
        } satisfies RpcResponse);
      }
      try {
        const result = await executeTool(toolName, args, ctx.organizationId, ctx.tokenId);
        return NextResponse.json({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        } satisfies RpcResponse);
      } catch (err) {
        return NextResponse.json({
          jsonrpc: "2.0", id,
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
        } satisfies RpcResponse);
      }
    }

    return NextResponse.json({
      jsonrpc: "2.0", id,
      error: { code: -32601, message: `Method no soportado: ${method}` },
    } satisfies RpcResponse);
  } catch (err) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32700, message: err instanceof Error ? err.message : String(err) },
    } satisfies RpcResponse, { status: 400 });
  }
}
