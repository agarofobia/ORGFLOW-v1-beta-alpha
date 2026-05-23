"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type Connection,
  addEdge,
  Handle,
  Position,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  Circle,
  User,
  Settings,
  Zap,
  GitMerge,
  GitBranch,
  X,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { ProcessDefinition } from "@/db/schema";
import { useToast } from "@/components/ui/toast";
import type { ProcessNode, ProcessEdge } from "@/lib/bpm";

// ─── Node data type ───────────────────────────────────────────────────────────

export type FormFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file";

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[]; // for select — opciones manuales
  source?: "departments" | "employees" | "divisions"; // para select dinámico desde la org
  placeholder?: string;
  autoFolder?: string; // para file: carpeta destino en Docs
};

type BpmData = {
  label: string;
  description?: string;
  assigneeDeptId?: string;
  serviceAction?: string;
  formFields?: FormField[];
  allowTracking?: boolean;
};

type BpmNode = Node<BpmData>;

// ─── Conversion helpers ───────────────────────────────────────────────────────

function nodesToDB(rfNodes: BpmNode[]): ProcessNode[] {
  return rfNodes.map((n) => ({
    id: n.id,
    type: n.type!,
    label: n.data.label,
    description: n.data.description,
    assigneeDeptId: n.data.assigneeDeptId,
    serviceAction: n.data.serviceAction,
    position: n.position,
  }));
}

function nodesFromDB(dbNodes: ProcessNode[]): BpmNode[] {
  return dbNodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      description: n.description,
      assigneeDeptId: n.assigneeDeptId,
      serviceAction: n.serviceAction,
    },
  }));
}

function edgesToDB(rfEdges: Edge[]): ProcessEdge[] {
  return rfEdges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    label: typeof e.label === "string" ? e.label : undefined,
    condition: (e.data as Record<string, unknown>)?.condition as string | undefined,
  }));
}

function edgesFromDB(dbEdges: ProcessEdge[]): Edge[] {
  return dbEdges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    type: "smoothstep",
    style: { stroke: "#3D7EFF", strokeWidth: 1.5 },
    data: { condition: e.condition },
  }));
}

// ─── Custom node components ───────────────────────────────────────────────────

function StartEventNode({ data }: { data: BpmData }) {
  return (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-full"
      style={{ background: "rgba(16,217,160,0.15)", border: "2px solid #10D9A0" }}>
      <div className="h-5 w-5 rounded-full" style={{ background: "#10D9A0" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "#10D9A0", width: 8, height: 8, border: "none", bottom: -5 }} />
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase"
        style={{ color: "#10D9A0" }}>{data.label}</div>
    </div>
  );
}

function EndEventNode({ data }: { data: BpmData }) {
  return (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-full"
      style={{ background: "rgba(244,63,94,0.15)", border: "3px solid #F43F5E" }}>
      <div className="h-5 w-5 rounded-full" style={{ background: "#F43F5E", border: "2px solid rgba(244,63,94,0.4)" }} />
      <Handle type="target" position={Position.Top}
        style={{ background: "#F43F5E", width: 8, height: 8, border: "none", top: -5 }} />
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase"
        style={{ color: "#F43F5E" }}>{data.label}</div>
    </div>
  );
}

function UserTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "#0E1220", border: "1px solid #3D7EFF40", borderLeft: "3px solid #3D7EFF" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "#3D7EFF", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgba(61,126,255,0.15)" }}>
          <User className="h-3.5 w-3.5" style={{ color: "#3D7EFF" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "#E2E8F8" }}>{data.label}</p>
          {data.assigneeDeptId && (
            <p className="mt-0.5 font-mono text-[9px]" style={{ color: "#7A8BAD" }}>
              Dept: {data.assigneeDeptId.slice(0, 8)}…
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "#3D7EFF", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function ServiceTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "#0E1220", border: "1px solid #F59E0B40", borderLeft: "3px solid #F59E0B" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "#F59E0B", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgba(245,158,11,0.15)" }}>
          <Settings className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "#E2E8F8" }}>{data.label}</p>
          {data.serviceAction && (
            <p className="mt-0.5 font-mono text-[9px]" style={{ color: "#7A8BAD" }}>{data.serviceAction}</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "#F59E0B", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function AutomatedTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "#0E1220", border: "1px solid #A855F740", borderLeft: "3px solid #A855F7" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "#A855F7", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgba(168,85,247,0.15)" }}>
          <Zap className="h-3.5 w-3.5" style={{ color: "#A855F7" }} />
        </div>
        <p className="text-xs font-medium" style={{ color: "#E2E8F8" }}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "#A855F7", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function DiamondNode({
  data,
  symbol,
  color,
}: {
  data: BpmData;
  symbol: string;
  color: string;
}) {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center"
      style={{ transform: "rotate(45deg)", background: `${color}18`, border: `2px solid ${color}`, borderRadius: "4px" }}>
      <Handle type="target" position={Position.Left}
        style={{ background: color, width: 8, height: 8, border: "none", left: -5, transform: "rotate(-45deg)" }} />
      <span style={{ color, transform: "rotate(-45deg)", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
        {symbol}
      </span>
      <Handle type="source" position={Position.Right}
        style={{ background: color, width: 8, height: 8, border: "none", right: -5, transform: "rotate(-45deg)" }} />
      <div style={{ position: "absolute", bottom: -28, left: "50%", transform: "rotate(-45deg) translateX(-50%)",
        color, fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {data.label}
      </div>
    </div>
  );
}

function ParallelGatewayNode({ data }: { data: BpmData }) {
  return <DiamondNode data={data} symbol="+" color="#F59E0B" />;
}
function ExclusiveGatewayNode({ data }: { data: BpmData }) {
  return <DiamondNode data={data} symbol="×" color="#F43F5E" />;
}

const nodeTypes = {
  startEvent: StartEventNode,
  endEvent: EndEventNode,
  userTask: UserTaskNode,
  serviceTask: ServiceTaskNode,
  automatedTask: AutomatedTaskNode,
  parallelGateway: ParallelGatewayNode,
  exclusiveGateway: ExclusiveGatewayNode,
};

// ─── Palette config ───────────────────────────────────────────────────────────

const PALETTE = [
  { type: "startEvent", label: "Inicio", icon: Circle, color: "#10D9A0", defaultLabel: "Inicio" },
  { type: "endEvent", label: "Fin", icon: Circle, color: "#F43F5E", defaultLabel: "Fin" },
  { type: "userTask", label: "Tarea humana", icon: User, color: "#3D7EFF", defaultLabel: "Nueva tarea" },
  { type: "serviceTask", label: "Servicio", icon: Settings, color: "#F59E0B", defaultLabel: "Servicio" },
  { type: "automatedTask", label: "Automática", icon: Zap, color: "#A855F7", defaultLabel: "Tarea automática" },
  { type: "parallelGateway", label: "Gateway paralelo", icon: GitMerge, color: "#F59E0B", defaultLabel: "Paralelo" },
  { type: "exclusiveGateway", label: "Gateway exclusivo", icon: GitBranch, color: "#F43F5E", defaultLabel: "Decisión" },
];

// ─── Hook puestos del organigrama ─────────────────────────────────────────────

type OrgPosition = { id: string; fullName: string; jobTitle: string };

function useOrgPositions() {
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.ok ? r.json() : [])
      .then((data: OrgPosition[]) => {
        if (Array.isArray(data)) setPositions(data);
      })
      .catch(() => {});
  }, []);
  return positions;
}

// ─── Form fields editor ───────────────────────────────────────────────────────

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección" },
  { value: "checkbox", label: "Checkbox" },
  { value: "file", label: "Archivo" },
];

function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const addField = () => {
    onChange([
      ...fields,
      { id: `field-${Date.now()}`, type: "text", label: "Nuevo campo", required: false },
    ]);
  };

  const updateField = (id: string, patch: Partial<FormField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
          Campos del formulario
        </label>
        <button
          onClick={addField}
          className="rounded px-2 py-0.5 font-mono text-[9px] text-white"
          style={{ background: "#3D7EFF" }}
        >
          + Campo
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-[10px]" style={{ color: "#3A4560" }}>
          Sin campos — el responsable solo confirma la tarea.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {fields.map((field, i) => (
          <div key={field.id} className="rounded px-2 py-2"
            style={{ background: "#141928", border: "1px solid #1E2540" }}>
            <div className="mb-1.5 flex items-center gap-1">
              <span className="font-mono text-[9px]" style={{ color: "#4A5568" }}>{i + 1}</span>
              <input
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "#0E1220", border: "1px solid #1E2540", color: "#E2E8F8" }}
              />
              <button onClick={() => removeField(field.id)} style={{ color: "#7A8BAD" }}>
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={field.type}
                onChange={(e) => updateField(field.id, { type: e.target.value as FormFieldType })}
                className="flex-1 rounded px-1.5 py-1 text-[10px] outline-none"
                style={{ background: "#0E1220", border: "1px solid #1E2540", color: "#C4CFEA" }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[10px]" style={{ color: "#7A8BAD" }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(field.id, { required: e.target.checked })}
                />
                Req.
              </label>
            </div>
            {field.type === "select" && (
              <div className="mt-1.5 flex flex-col gap-1">
                {/* Toggle: manual vs dynamic */}
                <div className="flex gap-1">
                  {(["manual", "departments", "employees", "divisions"] as const).map((opt) => {
                    const active = opt === "manual" ? !field.source : field.source === opt;
                    const labels: Record<string, string> = { manual: "Manual", departments: "Depts", employees: "Empleados", divisions: "Divisiones" };
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateField(field.id, { source: opt === "manual" ? undefined : opt as "departments" | "employees" | "divisions" })}
                        className="rounded px-1.5 py-0.5 text-[9px] transition-colors"
                        style={{
                          background: active ? "#3D7EFF22" : "#0E1220",
                          border: `1px solid ${active ? "#3D7EFF" : "#1E2540"}`,
                          color: active ? "#3D7EFF" : "#7A8BAD",
                        }}
                      >
                        {labels[opt]}
                      </button>
                    );
                  })}
                </div>
                {/* Manual options input — only when no dynamic source */}
                {!field.source && (
                  <input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) => updateField(field.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="Opción 1, Opción 2…"
                    className="w-full rounded px-2 py-1 text-[10px] outline-none"
                    style={{ background: "#0E1220", border: "1px solid #1E2540", color: "#C4CFEA" }}
                  />
                )}
                {field.source && (
                  <p className="text-[9px]" style={{ color: "#7A8BAD" }}>
                    Opciones cargadas dinámicamente desde {field.source === "departments" ? "departamentos" : field.source === "employees" ? "empleados" : "divisiones"} de la org.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({
  node,
  onUpdate,
  onClose,
}: {
  node: BpmNode;
  onUpdate: (id: string, data: Partial<BpmData>) => void;
  onClose: () => void;
}) {
  const positions = useOrgPositions();

  // Agrupar posiciones por puesto (job title)
  const byTitle = positions.reduce<Record<string, OrgPosition[]>>((acc, p) => {
    const key = p.jobTitle || "Sin puesto";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const jobTitles = Object.keys(byTitle).sort();

  // Derivar puesto seleccionado desde assigneeDeptId (guardamos "jobTitle||personId")
  const [selectedTitle, setSelectedTitle] = useState(() => {
    if (!node.data.assigneeDeptId) return "";
    const [title] = node.data.assigneeDeptId.split("||");
    return title;
  });

  const [selectedPerson, setSelectedPerson] = useState(() => {
    if (!node.data.assigneeDeptId) return "";
    const parts = node.data.assigneeDeptId.split("||");
    return parts[1] ?? "";
  });

  const handleTitleChange = (title: string) => {
    setSelectedTitle(title);
    setSelectedPerson("");
    const value = title ? title : undefined;
    onUpdate(node.id, { assigneeDeptId: value });
  };

  const handlePersonChange = (personId: string) => {
    setSelectedPerson(personId);
    const value = selectedTitle
      ? personId
        ? `${selectedTitle}||${personId}`
        : selectedTitle
      : undefined;
    onUpdate(node.id, { assigneeDeptId: value });
  };

  return (
    <div
      className="flex flex-col gap-3"
      style={{
        width: 240,
        background: "#0E1220",
        border: "1px solid #1E2540",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
          Propiedades
        </p>
        <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar" className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
          Nombre
        </label>
        <input
          value={node.data.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}
        />
      </div>

      {(node.type !== "startEvent" && node.type !== "endEvent") && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
            Descripción
          </label>
          <textarea
            value={node.data.description ?? ""}
            onChange={(e) => onUpdate(node.id, { description: e.target.value })}
            rows={2}
            className="w-full resize-none rounded px-3 py-2 text-sm outline-none"
            style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}
          />
        </div>
      )}

      {node.type === "userTask" && (
        <>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
              Puesto responsable
            </label>
            <select
              value={selectedTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}
            >
              <option value="">— Sin asignar —</option>
              {jobTitles.map((title) => (
                <option key={title} value={title}>
                  {title} ({byTitle[title].length})
                </option>
              ))}
            </select>
            {jobTitles.length === 0 && (
              <p className="mt-1 font-mono text-[9px]" style={{ color: "#3A4560" }}>
                Sin puestos en el organigrama todavía
              </p>
            )}
          </div>

          {selectedTitle && byTitle[selectedTitle]?.length > 1 && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
                Persona específica (opcional)
              </label>
              <select
                value={selectedPerson}
                onChange={(e) => handlePersonChange(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}
              >
                <option value="">— Cualquiera del puesto —</option>
                {byTitle[selectedTitle].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {node.type === "userTask" && (
        <>
          <FormFieldsEditor
            fields={node.data.formFields ?? []}
            onChange={(fields) => onUpdate(node.id, { formFields: fields })}
          />
          <label className="flex items-center gap-2 text-xs" style={{ color: "#7A8BAD", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={node.data.allowTracking ?? false}
              onChange={(e) => onUpdate(node.id, { allowTracking: e.target.checked })}
            />
            Permitir seguimiento al paso anterior
          </label>
        </>
      )}

      {(node.type === "serviceTask" || node.type === "automatedTask") && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
            Service action
          </label>
          <input
            value={node.data.serviceAction ?? ""}
            onChange={(e) => onUpdate(node.id, { serviceAction: e.target.value || undefined })}
            placeholder="ej: send_welcome_email"
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Inner flow (needs ReactFlowProvider context) ─────────────────────────────

function DesignerFlow({
  definition,
  onSave,
  saving,
  onDirtyChange,
}: {
  definition: ProcessDefinition;
  onSave: (nodes: ProcessNode[], edges: ProcessEdge[]) => Promise<void>;
  saving: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<BpmNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<BpmNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  // Track cambios sin guardar — se setea true en cualquier mutación post-load.
  // Se resetea cuando definition cambia (load nuevo o post-save trae fresh).
  const [isDirty, setIsDirty] = useState(false);
  // notify parent on dirty changes (para showar "● Cambios sin guardar" en topbar fuera de este componente)
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const dbNodes = definition.nodes as unknown as ProcessNode[];
    const dbEdges = definition.edges as unknown as ProcessEdge[];
    setNodes(nodesFromDB(Array.isArray(dbNodes) ? dbNodes : []));
    setEdges(edgesFromDB(Array.isArray(dbEdges) ? dbEdges : []));
    // El load (inicial o post-save) limpia el dirty flag.
    setIsDirty(false);
  }, [definition.id, definition.nodes, definition.edges, setNodes, setEdges]);

  // Wrap onNodesChange para detectar mutaciones persistentes (no "select" / "dimensions").
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes);
    const persistent = changes.some(c => c.type === "position" || c.type === "remove" || c.type === "add" || c.type === "replace");
    if (persistent) setIsDirty(true);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    onEdgesChange(changes);
    const persistent = changes.some(c => c.type === "remove" || c.type === "add" || c.type === "replace");
    if (persistent) setIsDirty(true);
  }, [onEdgesChange]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // Detectar si el source es un exclusiveGateway para pedir condición
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isGateway = sourceNode?.type === "exclusiveGateway";
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            style: { stroke: isGateway ? "#F43F5E" : "#3D7EFF", strokeWidth: 1.5 },
            label: isGateway ? "condición" : undefined,
            data: { condition: isGateway ? "" : undefined },
          },
          eds
        )
      );
      setIsDirty(true);
    },
    [setEdges, nodes]
  );

  const addNode = (type: string, defaultLabel: string) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const offset = nodes.length * 20;
    const id = `${type}-${Date.now()}`;
    const newNode: BpmNode = {
      id,
      type,
      position: { x: center.x - 80 + offset, y: center.y - 40 + offset },
      data: { label: defaultLabel },
    };
    setNodes((nds) => [...nds, newNode]);
    setIsDirty(true);
  };

  const updateNodeData = (id: string, data: Partial<BpmData>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n))
    );
    if (selectedNode?.id === id) {
      setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, ...data } } : null);
    }
    setIsDirty(true);
  };

  const updateEdgeCondition = (edgeId: string, condition: string) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? { ...e, label: condition || "condición", data: { ...((e.data as Record<string, unknown>) ?? {}), condition } }
          : e
      )
    );
    setSelectedEdge((prev) =>
      prev?.id === edgeId
        ? { ...prev, label: condition || "condición", data: { ...((prev.data as Record<string, unknown>) ?? {}), condition } }
        : prev
    );
    setIsDirty(true);
  };

  // beforeunload guard — alerta al user antes de cerrar pestaña si tiene cambios sin guardar.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // En navegadores modernos el string es ignorado, pero la promesa de bloqueo se respeta.
      e.returnValue = "Tenés cambios sin guardar en el proceso. ¿Salir igual?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Ctrl+S / Cmd+S → guardar. No interferimos si el user está tipeando en un input.
  // Esc → cierra paneles laterales abiertos (nodo o edge).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saving) onSave(nodesToDB(nodes), edgesToDB(edges));
      }
      if (e.key === "Escape" && (selectedNode || selectedEdge)) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, saving, nodes, edges, onSave, selectedNode, selectedEdge]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: BpmNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    // Solo permitir edición en edges de exclusiveGateway
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (sourceNode?.type === "exclusiveGateway") {
      setSelectedEdge(edge);
      setSelectedNode(null);
    }
  }, [nodes]);

  const handleSave = () => onSave(nodesToDB(nodes), edgesToDB(edges));

  return (
    <div className="relative flex h-full w-full">
      {/* Palette */}
      <div
        className="flex flex-col gap-1 p-3"
        style={{
          width: 180,
          background: "#080B12",
          borderRight: "1px solid #1E2540",
          flexShrink: 0,
        }}
      >
        <p
          className="mb-2 px-1 font-mono text-[9px] uppercase tracking-widest"
          style={{ color: "#7A8BAD" }}
        >
          Elementos
        </p>
        {PALETTE.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              onClick={() => addNode(item.type, item.defaultLabel)}
              className="flex items-center gap-2 rounded px-2 py-2 text-left text-xs transition-colors hover:bg-[#141928]"
              style={{ color: "#C4CFEA" }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}

        <div style={{ height: 1, background: "#1E2540", margin: "8px 0" }} />

        <div className="flex flex-col gap-1.5 px-1 font-mono text-[9px]" style={{ color: "#7A8BAD", lineHeight: 1.5 }}>
          <p><strong style={{ color: "#C4CFEA" }}>Conectar</strong>: arrastrar desde los handles azules.</p>
          <p><strong style={{ color: "#C4CFEA" }}>Borrar</strong>: seleccionar + tecla Delete.</p>
          <p><strong style={{ color: "#C4CFEA" }}>Editar</strong>: click en nodo → panel lateral.</p>
          <p><strong style={{ color: "#C4CFEA" }}>Guardar</strong>: Ctrl+S o botón.</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
          nodeTypes={nodeTypes}
          deleteKeyCode="Delete"
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "#080B12" }}
        >
          <Background color="#1E2540" gap={32} size={1} />
          <Controls style={{ background: "#0E1220", border: "1px solid #1E2540" }} />
          <Panel position="top-right" className="m-3">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              title={isDirty ? "Guardar cambios (Ctrl+S)" : "Sin cambios pendientes"}
              className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: isDirty ? "#3D7EFF" : "#1E2540",
                boxShadow: isDirty ? "0 0 12px rgba(61,126,255,0.3)" : "none",
              }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" strokeWidth={2} />
              )}
              {isDirty ? "Guardar" : "Guardado"}
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Properties panel — nodo */}
      {selectedNode && (
        <div className="absolute right-4 top-4 z-10">
          <PropertiesPanel
            node={selectedNode}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}

      {/* Edge condition panel — solo para exclusiveGateway */}
      {selectedEdge && (
        <div className="absolute right-4 top-4 z-10">
          <div style={{ width: 240, background: "#0E1220", border: "1px solid #F43F5E40", borderRadius: 8, padding: 16 }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#F43F5E" }}>
                Condición de decisión
              </p>
              <button onClick={() => setSelectedEdge(null)} className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mb-2 text-xs leading-relaxed" style={{ color: "#7A8BAD" }}>
              Define cuándo el flujo toma esta rama. Ej: <code style={{ color: "#F43F5E" }}>aprobado === true</code>
            </p>
            <textarea
              autoFocus
              rows={3}
              value={((selectedEdge.data as Record<string, unknown>)?.condition as string) ?? ""}
              onChange={(e) => updateEdgeCondition(selectedEdge.id, e.target.value)}
              placeholder="ej: monto > 10000"
              className="w-full resize-none rounded px-3 py-2 text-sm outline-none placeholder:text-[#3A4560]"
              style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}
            />
            <p className="mt-2 font-mono text-[9px]" style={{ color: "#3A4560" }}>
              La condición se muestra como etiqueta en la conexión
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

export default function ProcessDesignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: processId } = use(params);
  const router = useRouter();
  const [definition, setDefinition] = useState<ProcessDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const toast = useToast();
  // Templates de proyecto disponibles para asociar al proceso (cierra el loop BPM ↔ Proyectos)
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  useEffect(() => {
    fetch("/api/project-templates").then(r => r.ok ? r.json() : [])
      .then(data => setTemplates(Array.isArray(data) ? data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) : []))
      .catch(() => setTemplates([]));
  }, []);
  const [environment, setEnvironment] = useState<"test" | "production">("production");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  // Refs para click-outside en dropdowns del topbar
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  // Cierra status dropdown si se clickea afuera
  useEffect(() => {
    if (!statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as unknown as globalThis.Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusOpen]);

  // Cierra template dropdown si se clickea afuera
  useEffect(() => {
    if (!templateOpen) return;
    const handler = (e: MouseEvent) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as unknown as globalThis.Node)) {
        setTemplateOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [templateOpen]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Escape para salir de fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  useEffect(() => {
    fetch(`/api/processes/${processId}`)
      .then((r) => r.json())
      .then((data) => {
        setDefinition(data);
        setName(data.name);
      })
      .finally(() => setLoading(false));
  }, [processId]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const handleSave = async (nodes: ProcessNode[], edges: ProcessEdge[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/processes/${processId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes,
          edges,
          status: definition?.status,
          category: definition?.category,
          environment,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDefinition(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: "draft" | "active" | "archived") => {
    setStatusOpen(false);
    // Validación pre-activación: un proceso publicado tiene que ser ejecutable.
    // Sin startEvent o endEvent → al iniciar instancia el motor BPM crashea.
    if (status === "active" && definition) {
      const nodes = (definition.nodes ?? []) as unknown as ProcessNode[];
      const hasStart = Array.isArray(nodes) && nodes.some(n => n.type === "startEvent");
      const hasEnd = Array.isArray(nodes) && nodes.some(n => n.type === "endEvent");
      if (!hasStart || !hasEnd) {
        const missing = [!hasStart && "Inicio", !hasEnd && "Fin"].filter(Boolean).join(" y ");
        toast.error("No se puede publicar", `Falta nodo ${missing}. Agregalo desde la paleta antes de activar.`);
        return;
      }
    }
    const res = await fetch(`/api/processes/${processId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDefinition(updated);
      if (status === "active") toast.success("Proceso publicado", "Ya podés iniciar instancias.");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error("No se pudo cambiar el estado", err.error ?? "Error desconocido");
    }
  };

  const handleStart = async () => {
    const res = await fetch(`/api/processes/${processId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: {} }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.projectId) {
        // Proyecto creado: toast con CTA implícito (la nav la maneja el user via /dashboard/projects)
        toast.success("Instancia iniciada + proyecto creado", "Abrí Proyectos para ver la estructura armada.");
        // Auto-redirect después de 1.5s para no quedar bloqueado
        setTimeout(() => { window.location.href = `/dashboard/projects?id=${data.projectId}`; }, 1500);
      } else {
        toast.success("Instancia iniciada", `ID: ${String(data.instanceId).slice(0, 8)}`);
      }
    } else {
      toast.error("No se pudo iniciar", data.error);
    }
  };

  // Cambiar template asociado al proceso
  const handleTemplateChange = async (templateId: string | null) => {
    const res = await fetch(`/api/processes/${processId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectTemplateId: templateId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDefinition(updated);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#3D7EFF" }} />
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p style={{ color: "#7A8BAD" }}>Proceso no encontrado</p>
        <button
          onClick={() => router.push("/dashboard/processes")}
          className="text-sm"
          style={{ color: "#3D7EFF" }}
        >
          ← Volver a procesos
        </button>
      </div>
    );
  }

  const statusColor =
    definition.status === "active"
      ? "#10D9A0"
      : definition.status === "archived"
      ? "#F59E0B"
      : "#7A8BAD";

  return (
    <div
      className="flex flex-col"
      style={{
        background: "#080B12",
        ...(isFullscreen
          ? { position: "fixed", inset: 0, zIndex: 60, height: "100vh" }
          : { height: "100%" }),
      }}
    >
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid #1E2540", background: "#080B12" }}
      >
        <button
          onClick={() => router.push("/dashboard/processes")}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors hover:bg-[#141928]"
          style={{ color: "#7A8BAD" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div style={{ width: 1, height: 20, background: "#1E2540" }} />

        {/* Editable name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="rounded px-2 py-1 text-sm font-medium outline-none"
            style={{
              background: "#141928",
              border: "1px solid #3D7EFF",
              color: "#E2E8F8",
              minWidth: 200,
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-[#141928]"
            style={{ color: "#E2E8F8" }}
          >
            {name}
          </button>
        )}

        {/* Status dropdown */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            onClick={() => setStatusOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-[#141928]"
            style={{ color: statusColor }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: statusColor }}
            />
            {STATUS_LABELS[definition.status]}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg py-1"
              style={{ background: "#0E1220", border: "1px solid #1E2540", minWidth: 130 }}
            >
              {(["draft", "active", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className="px-3 py-2 text-left text-xs hover:bg-[#141928]"
                  style={{ color: "#C4CFEA" }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template de proyecto asociado — cierra el loop BPM */}
        <div className="relative" ref={templateDropdownRef}>
          <button
            onClick={() => setTemplateOpen(v => !v)}
            title="Template de proyecto que se instancia al iniciar este proceso"
            className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-[#141928]"
            style={{
              color: definition.projectTemplateId ? "#A855F7" : "#7A8BAD",
              border: `1px solid ${definition.projectTemplateId ? "rgba(168,85,247,0.4)" : "#1E2540"}`,
            }}
          >
            <span style={{ fontSize: 11 }}>⚐</span>
            {definition.projectTemplateId
              ? (templates.find(t => t.id === definition.projectTemplateId)?.name ?? "Template").slice(0, 20)
              : "Sin template"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {templateOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg py-1"
              style={{ background: "#0E1220", border: "1px solid #1E2540", minWidth: 220, maxHeight: 260, overflowY: "auto" }}
            >
              <button
                onClick={() => { handleTemplateChange(null); setTemplateOpen(false); }}
                className="px-3 py-2 text-left text-xs hover:bg-[#141928]"
                style={{ color: definition.projectTemplateId ? "#7A8BAD" : "#F43F5E", borderBottom: "1px solid #1E2540" }}
              >
                ✕ Sin template
              </button>
              {templates.length === 0 ? (
                <p className="px-3 py-3 text-xs italic" style={{ color: "#7A8BAD" }}>
                  Creá templates en /dashboard/projects
                </p>
              ) : templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { handleTemplateChange(t.id); setTemplateOpen(false); }}
                  className="px-3 py-2 text-left text-xs hover:bg-[#141928]"
                  style={{
                    color: definition.projectTemplateId === t.id ? "#A855F7" : "#C4CFEA",
                    background: definition.projectTemplateId === t.id ? "rgba(168,85,247,0.08)" : "transparent",
                  }}
                >
                  ⚐ {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Environment toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: "1px solid #1E2540" }}>
          {(["test", "production"] as const).map((env) => (
            <button
              key={env}
              onClick={() => setEnvironment(env)}
              className="px-3 py-1 font-mono text-[10px] uppercase transition-colors"
              style={
                environment === env
                  ? { background: env === "test" ? "rgba(245,158,11,0.15)" : "rgba(16,217,160,0.12)",
                      color: env === "test" ? "#F59E0B" : "#10D9A0" }
                  : { background: "transparent", color: "#4A5568" }
              }
            >
              {env === "test" ? "Test" : "Prod"}
            </button>
          ))}
        </div>

        {/* Indicador de estado de guardado:
            - "● Sin guardar" rojo si hay cambios pendientes
            - "✓ Guardado" verde durante 2.5s post-save (saved flag)
            - silencioso si todo está limpio */}
        {editorDirty && !saved && (
          <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: "#F43F5E" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F43F5E" }} />
            Sin guardar
          </span>
        )}
        {saved && (
          <span className="font-mono text-[11px]" style={{ color: "#10D9A0" }}>
            ✓ Guardado
          </span>
        )}

        <button
          onClick={() => setIsFullscreen(v => !v)}
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[#141928]"
          style={{ color: isFullscreen ? "#3D7EFF" : "#7A8BAD", border: "1px solid #1E2540" }}
        >
          {isFullscreen
            ? <Minimize2 className="h-3.5 w-3.5" />
            : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        {definition.status === "active" && (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: "rgba(16,217,160,0.1)",
              color: "#10D9A0",
              border: "1px solid rgba(16,217,160,0.25)",
            }}
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" />
            Iniciar instancia
          </button>
        )}
      </div>

      {/* Designer canvas */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ReactFlowProvider>
          <DesignerFlow
            definition={definition}
            onSave={handleSave}
            saving={saving}
            onDirtyChange={setEditorDirty}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
