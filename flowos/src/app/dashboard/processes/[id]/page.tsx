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
  Activity,
  ListChecks,
  LayoutTemplate,
  Plus,
  Trash2,
  Check,
  Heading,
  Minus,
  SquareDashed,
  Type as TextIcon,
  Image as ImageIcon,
} from "lucide-react";
import Moveable from "react-moveable";
import type { ProcessDefinition } from "@/db/schema";
import { useToast } from "@/components/ui/toast";
import type { ProcessNode, ProcessEdge, LayoutElement, ShowWhen, ConditionOperator } from "@/lib/bpm";
import AuditPanel from "@/components/dashboard/processes/audit-panel";
import { usePermissions } from "@/hooks/usePermissions";

// ─── Node data type ───────────────────────────────────────────────────────────

export type FormFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file" | "currency" | "radio" | "multiselect";

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
  // Layout visual de la ventana de este paso (builder estilo Canva, por paso).
  layout?: LayoutElement[];
  allowTracking?: boolean;
  // Heatmap overlay — cuando está activo en el editor, este campo se inyecta
  // con el color calculado del cycle time del nodo (verde rápido → rojo lento).
  heatBorder?: string;
  heatLabel?: string;  // ej "23s avg" para tooltip
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
    layout: n.data.layout,
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
      layout: n.layout,
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
    style: { stroke: "var(--c-accent-blue)", strokeWidth: 1.5 },
    data: { condition: e.condition },
  }));
}

// ─── Custom node components ───────────────────────────────────────────────────

function StartEventNode({ data }: { data: BpmData }) {
  return (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-full"
      style={{ background: "rgb(var(--c-accent-emerald-rgb) / 0.15)", border: "2px solid var(--c-accent-emerald)" }}>
      <div className="h-5 w-5 rounded-full" style={{ background: "var(--c-accent-emerald)" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-emerald)", width: 8, height: 8, border: "none", bottom: -5 }} />
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase"
        style={{ color: "var(--c-accent-emerald)" }}>{data.label}</div>
    </div>
  );
}

function EndEventNode({ data }: { data: BpmData }) {
  return (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-full"
      style={{ background: "rgb(var(--c-accent-red-rgb) / 0.15)", border: "3px solid var(--c-accent-red)" }}>
      <div className="h-5 w-5 rounded-full" style={{ background: "var(--c-accent-red)", border: "2px solid rgb(var(--c-accent-red-rgb) / 0.4)" }} />
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-red)", width: 8, height: 8, border: "none", top: -5 }} />
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase"
        style={{ color: "var(--c-accent-red)" }}>{data.label}</div>
    </div>
  );
}

function UserTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      title={data.heatLabel}
      style={{
        background: "var(--c-bg-surface)",
        border: data.heatBorder ? `1px solid ${data.heatBorder}` : "1px solid rgb(var(--c-accent-blue-rgb) / 0.25)",
        borderLeft: data.heatBorder ? `5px solid ${data.heatBorder}` : "3px solid var(--c-accent-blue)",
        boxShadow: data.heatBorder ? `0 0 24px ${data.heatBorder}40` : undefined,
      }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-blue)", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.15)" }}>
          <User className="h-3.5 w-3.5" style={{ color: "var(--c-accent-blue)" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "var(--c-text-primary)" }}>{data.label}</p>
          {data.assigneeDeptId && (
            <p className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>
              Dept: {data.assigneeDeptId.slice(0, 8)}…
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-blue)", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function ServiceTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      title={data.heatLabel}
      style={{
        background: "var(--c-bg-surface)",
        border: data.heatBorder ? `1px solid ${data.heatBorder}` : "1px solid rgb(var(--c-accent-amber-rgb) / 0.25)",
        borderLeft: data.heatBorder ? `5px solid ${data.heatBorder}` : "3px solid var(--c-accent-amber)",
        boxShadow: data.heatBorder ? `0 0 24px ${data.heatBorder}40` : undefined,
      }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-amber)", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)" }}>
          <Settings className="h-3.5 w-3.5" style={{ color: "var(--c-accent-amber)" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "var(--c-text-primary)" }}>{data.label}</p>
          {data.serviceAction && (
            <p className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>{data.serviceAction}</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-amber)", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function AutomatedTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-violet-rgb) / 0.25)", borderLeft: "3px solid var(--c-accent-violet)" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-violet)", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgb(var(--c-accent-violet-rgb) / 0.15)" }}>
          <Zap className="h-3.5 w-3.5" style={{ color: "var(--c-accent-violet)" }} />
        </div>
        <p className="text-xs font-medium" style={{ color: "var(--c-text-primary)" }}>{data.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-violet)", width: 8, height: 8, border: "none" }} />
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
  return <DiamondNode data={data} symbol="+" color="var(--c-accent-amber)" />;
}
function ExclusiveGatewayNode({ data }: { data: BpmData }) {
  return <DiamondNode data={data} symbol="×" color="var(--c-accent-red)" />;
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
  { type: "startEvent", label: "Inicio", icon: Circle, color: "var(--c-accent-emerald)", defaultLabel: "Inicio" },
  { type: "endEvent", label: "Fin", icon: Circle, color: "var(--c-accent-red)", defaultLabel: "Fin" },
  { type: "userTask", label: "Tarea humana", icon: User, color: "var(--c-accent-blue)", defaultLabel: "Nueva tarea" },
  { type: "serviceTask", label: "Servicio", icon: Settings, color: "var(--c-accent-amber)", defaultLabel: "Servicio" },
  { type: "automatedTask", label: "Automática", icon: Zap, color: "var(--c-accent-violet)", defaultLabel: "Tarea automática" },
  { type: "parallelGateway", label: "Gateway paralelo", icon: GitMerge, color: "var(--c-accent-amber)", defaultLabel: "Paralelo" },
  { type: "exclusiveGateway", label: "Gateway exclusivo", icon: GitBranch, color: "var(--c-accent-red)", defaultLabel: "Decisión" },
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
  { value: "currency", label: "Moneda ($)" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección" },
  { value: "radio", label: "Opción única" },
  { value: "multiselect", label: "Selección múltiple" },
  { value: "checkbox", label: "Checkbox" },
  { value: "file", label: "Archivo" },
];

// Tipos de campo que usan lista de opciones (options / source dinámico).
const OPTION_FIELD_TYPES: FormFieldType[] = ["select", "radio", "multiselect"];

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
        <label className="font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
          Campos del formulario
        </label>
        <button
          onClick={addField}
          className="rounded px-2 py-0.5 font-mono text-[9px] text-white"
          style={{ background: "var(--c-accent-blue)" }}
        >
          + Campo
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-[10px]" style={{ color: "var(--c-text-placeholder)" }}>
          Sin campos — el responsable solo confirma la tarea.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {fields.map((field, i) => (
          <div key={field.id} className="rounded px-2 py-2"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
            <div className="mb-1.5 flex items-center gap-1">
              <span className="font-mono text-[9px]" style={{ color: "var(--c-text-dim)" }}>{i + 1}</span>
              <input
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
              />
              <button onClick={() => removeField(field.id)} style={{ color: "var(--c-text-muted)" }}>
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={field.type}
                onChange={(e) => updateField(field.id, { type: e.target.value as FormFieldType })}
                className="flex-1 rounded px-1.5 py-1 text-[10px] outline-none"
                style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(field.id, { required: e.target.checked })}
                />
                Req.
              </label>
            </div>
            {OPTION_FIELD_TYPES.includes(field.type) && (
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
                          background: active ? "rgb(var(--c-accent-blue-rgb) / 0.13)" : "var(--c-bg-surface)",
                          border: `1px solid ${active ? "var(--c-accent-blue)" : "var(--c-border)"}`,
                          color: active ? "var(--c-accent-blue)" : "var(--c-text-muted)",
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
                    style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}
                  />
                )}
                {field.source && (
                  <p className="text-[9px]" style={{ color: "var(--c-text-muted)" }}>
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

// ─── Step Layout Builder (lienzo visual estilo Canva, por paso) ───────────────
// Diseñador WYSIWYG de la ventana de un paso. Arrastrás campos/títulos/textos al
// lienzo, los posicionás y redimensionás con guías de alineación (react-moveable).
// El ancho del lienzo = ancho de la ventana del runtime (WYSIWYG).

const CANVAS_W = 680;
const CANVAS_H = 900;

// Elementos visuales de la paleta — con ícono y descripción de qué hace cada uno.
const PALETTE_ELEMENTS: { kind: "title" | "text" | "divider" | "section" | "image"; label: string; desc: string; Icon: typeof Heading }[] = [
  { kind: "title", label: "Título", desc: "Encabezado grande de la ventana.", Icon: Heading },
  { kind: "text", label: "Texto", desc: "Subtítulo o instrucción de ayuda.", Icon: TextIcon },
  { kind: "divider", label: "Divisor", desc: "Línea para separar secciones.", Icon: Minus },
  { kind: "section", label: "Sección", desc: "Caja de fondo para agrupar campos visualmente.", Icon: SquareDashed },
  { kind: "image", label: "Imagen", desc: "Logo, diagrama o instrucción visual (URL o subida).", Icon: ImageIcon },
];

// Tipografías disponibles para título/texto.
const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Por defecto", value: "" },
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Sans-serif", value: "system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Monoespaciada", value: "monospace" },
];

function nid() {
  return `el-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

function StepLayoutBuilder({
  nodeLabel,
  processFields,
  layout,
  onChange,
  onClose,
}: {
  nodeLabel: string;
  processFields: FormField[];
  layout: LayoutElement[];
  onChange: (layout: LayoutElement[]) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const usedFieldIds = new Set(layout.filter((e) => e.kind === "field").map((e) => e.fieldId));
  // Nuevo elemento debajo del más bajo existente (sin superposición).
  const bottomMost = layout.reduce((m, e) => Math.max(m, e.y + e.h), 0);
  const nextY = Math.min(CANVAS_H - 90, bottomMost > 0 ? bottomMost + 16 : 24);

  const update = (next: LayoutElement[]) => onChange(next);
  const patchEl = (id: string, patch: Partial<LayoutElement>) =>
    update(layout.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEl = (id: string) => {
    update(layout.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const addField = (f: FormField) => {
    if (usedFieldIds.has(f.id)) return;
    const el: LayoutElement = { id: nid(), kind: "field", fieldId: f.id, x: 24, y: nextY, w: 280, h: 66 };
    update([...layout, el]);
    setSelectedId(el.id);
  };
  const addPresentation = (kind: "title" | "text" | "divider" | "section" | "image") => {
    const base = { id: nid(), kind, x: 24, y: nextY } as LayoutElement;
    if (kind === "title") Object.assign(base, { text: "Título", w: 360, h: 44, fontSize: 22, align: "left" });
    if (kind === "text") Object.assign(base, { text: "Texto de ayuda", w: 360, h: 30, fontSize: 13, align: "left" });
    if (kind === "divider") Object.assign(base, { w: 460, h: 2 });
    if (kind === "section") Object.assign(base, { text: "Sección", w: 480, h: 160 });
    if (kind === "image") Object.assign(base, { src: "", w: 200, h: 120 });
    update([...layout, base]);
    setSelectedId(base.id);
  };

  const selected = layout.find((e) => e.id === selectedId) ?? null;
  const fieldOf = (fid?: string) => processFields.find((f) => f.id === fid);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--c-bg-base)" }}>
      {/* Header — barra superior estilo módulo */}
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--c-border)", background: "linear-gradient(180deg, rgb(var(--c-accent-blue-rgb) / 0.07), var(--c-bg-surface))" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.15)", boxShadow: "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.2)" }}>
            <LayoutTemplate className="h-5 w-5" style={{ color: "var(--c-accent-blue)" }} />
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Diseñador de ventana · {nodeLabel}</p>
            <p className="text-base font-semibold" style={{ color: "var(--c-text-primary)" }}>Diseñar ventana del paso</p>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px" style={{ background: "var(--c-accent-blue)", boxShadow: "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.35)" }}>
          <Check className="h-4 w-4" /> Listo
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Paleta — con íconos + descripción de cada herramienta */}
        <div className="w-60 shrink-0 overflow-y-auto border-r p-4" style={{ borderColor: "var(--c-border)", background: "var(--c-bg-surface)" }}>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Campos del proceso</p>
          {processFields.length === 0 ? (
            <p className="mb-4 text-[10px] leading-relaxed" style={{ color: "var(--c-text-placeholder)" }}>Sin campos todavía. Crealos con el botón &quot;Campos&quot; del editor del proceso, después los arrastrás acá.</p>
          ) : (
            <div className="mb-4 flex flex-col gap-1">
              {processFields.map((f) => {
                const used = usedFieldIds.has(f.id);
                return (
                  <button key={f.id} type="button" disabled={used} onClick={() => addField(f)}
                    title={used ? "Ya está en la ventana" : `Agregar ${f.label}`}
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] transition-colors hover:border-[var(--c-accent-blue)] disabled:opacity-40"
                    style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)", cursor: used ? "default" : "pointer" }}>
                    {used ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-emerald)" }} /> : <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-blue)" }} />}
                    <span className="truncate" title={f.label}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Elementos visuales</p>
          <div className="flex flex-col gap-1.5">
            {PALETTE_ELEMENTS.map(({ kind, label, desc, Icon }) => (
              <button key={kind} type="button" onClick={() => addPresentation(kind)}
                title={desc}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:border-[var(--c-accent-violet)]"
                style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded" style={{ background: "rgb(var(--c-accent-violet-rgb) / 0.12)" }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: "var(--c-accent-violet)" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium" style={{ color: "var(--c-text-secondary)" }}>{label}</p>
                  <p className="text-[9px] leading-tight" style={{ color: "var(--c-text-muted)" }}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

          {/* Lienzo — área con grid + glow estilo app */}
          <div
            className="flex-1 overflow-auto p-8"
            style={{
              background: `
                linear-gradient(to right, rgb(var(--c-border-rgb) / 0.35) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, rgb(var(--c-border-rgb) / 0.35) 1px, transparent 1px) 0 0 / 32px 32px,
                radial-gradient(ellipse at 25% 15%, rgb(var(--c-accent-blue-rgb) / 0.10), transparent 55%),
                radial-gradient(ellipse at 80% 85%, rgb(var(--c-accent-violet-rgb) / 0.08), transparent 55%),
                var(--c-bg-base)`,
            }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            {/* Hoja: la ventana que verá el ejecutor (WYSIWYG) */}
            <div
              className="relative mx-auto"
              style={{
                width: CANVAS_W, height: CANVAS_H,
                background: `
                  linear-gradient(to right, rgb(var(--c-border-rgb) / 0.25) 1px, transparent 1px) 0 0 / 24px 24px,
                  linear-gradient(to bottom, rgb(var(--c-border-rgb) / 0.25) 1px, transparent 1px) 0 0 / 24px 24px,
                  var(--c-bg-surface)`,
                border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.2)",
                borderRadius: 12,
                boxShadow: "0 8px 40px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(var(--c-accent-blue-rgb) / 0.06)",
              }}
            >
              {layout.map((el) => (
                <div
                  key={el.id}
                  data-lid={el.id}
                  onMouseDown={() => setSelectedId(el.id)}
                  className="absolute transition-shadow"
                  style={{
                    left: el.x, top: el.y, width: el.w, height: el.h,
                    outline: selectedId === el.id ? "2px solid var(--c-accent-blue)" : "1px dashed rgb(var(--c-border-rgb) / 0.8)",
                    boxShadow: selectedId === el.id ? "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.3)" : undefined,
                    borderRadius: el.kind === "divider" ? 0 : 6,
                    // Las secciones van detrás (fondo); el resto encima.
                    zIndex: el.kind === "section" ? 1 : 2,
                    cursor: "move", boxSizing: "border-box", overflow: "hidden",
                  }}
                >
                  <LayoutElementPreview el={el} field={fieldOf(el.fieldId)} />
                </div>
              ))}
              {selected && (
                <Moveable
                  target={`[data-lid="${selected.id}"]`}
                  draggable
                  resizable
                  origin={false}
                  snappable
                  snapThreshold={7}
                  throttleDrag={0}
                  throttleResize={0}
                  elementGuidelines={layout.filter((e) => e.id !== selected.id).map((e) => `[data-lid="${e.id}"]`)}
                  snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
                  elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
                  bounds={{ left: 0, top: 0, right: 0, bottom: 0, position: "css" }}
                  // Drag/resize SUAVE: durante el gesto movemos el DOM directo (sin
                  // setState → sin re-render por frame). Persistimos al soltar.
                  onDrag={({ target, left, top }) => {
                    (target as HTMLElement).style.left = `${left}px`;
                    (target as HTMLElement).style.top = `${top}px`;
                  }}
                  onDragEnd={({ lastEvent }) => {
                    if (lastEvent) patchEl(selected.id, { x: Math.round(lastEvent.left), y: Math.round(lastEvent.top) });
                  }}
                  onResize={({ target, width, height, drag }) => {
                    const t = target as HTMLElement;
                    t.style.width = `${width}px`;
                    t.style.height = `${height}px`;
                    t.style.left = `${drag.left}px`;
                    t.style.top = `${drag.top}px`;
                  }}
                  onResizeEnd={({ lastEvent }) => {
                    if (lastEvent) patchEl(selected.id, { w: Math.round(lastEvent.width), h: Math.round(lastEvent.height), x: Math.round(lastEvent.drag.left), y: Math.round(lastEvent.drag.top) });
                  }}
                />
              )}
            </div>
          </div>

          {/* Propiedades del elemento */}
          <div className="w-56 shrink-0 overflow-y-auto border-l p-3" style={{ borderColor: "var(--c-border)" }}>
            {!selected ? (
              <p className="text-[11px]" style={{ color: "var(--c-text-muted)" }}>Seleccioná un elemento del lienzo para editar sus propiedades.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
                    {selected.kind === "field" ? "Campo" : selected.kind === "title" ? "Título" : selected.kind === "text" ? "Texto" : selected.kind === "section" ? "Sección" : selected.kind === "image" ? "Imagen" : "Divisor"}
                  </p>
                  <button type="button" onClick={() => removeEl(selected.id)} title="Eliminar" style={{ color: "var(--c-accent-red)" }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {selected.kind === "field" && (
                  <>
                    <p className="text-xs" style={{ color: "var(--c-text-secondary)" }}>{fieldOf(selected.fieldId)?.label ?? "Campo"}</p>
                    <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--c-text-muted)", cursor: "pointer" }}>
                      <input type="checkbox" checked={selected.readOnly ?? false} onChange={(e) => patchEl(selected.id, { readOnly: e.target.checked })} />
                      Solo lectura en este paso
                    </label>
                  </>
                )}

                {(selected.kind === "title" || selected.kind === "text") && (
                  <>
                    <textarea
                      value={selected.text ?? ""}
                      onChange={(e) => patchEl(selected.id, { text: e.target.value })}
                      rows={2}
                      className="w-full rounded px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)", resize: "none" }}
                    />
                    <label className="flex items-center justify-between text-[11px]" style={{ color: "var(--c-text-muted)" }}>
                      Tamaño
                      <input type="number" value={selected.fontSize ?? 14} min={9} max={48}
                        onChange={(e) => patchEl(selected.id, { fontSize: Number(e.target.value) })}
                        className="w-16 rounded px-1.5 py-0.5 text-xs outline-none" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }} />
                    </label>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <button key={a} type="button" onClick={() => patchEl(selected.id, { align: a })}
                          className="flex-1 rounded px-1 py-0.5 text-[9px]"
                          style={{ background: (selected.align ?? "left") === a ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-elevated)", border: `1px solid ${(selected.align ?? "left") === a ? "var(--c-accent-blue)" : "var(--c-border)"}`, color: (selected.align ?? "left") === a ? "var(--c-accent-blue)" : "var(--c-text-muted)" }}>
                          {a === "left" ? "Izq" : a === "center" ? "Centro" : "Der"}
                        </button>
                      ))}
                    </div>
                    {/* Alineación vertical */}
                    <div className="flex gap-1">
                      {(["top", "middle", "bottom"] as const).map((a) => (
                        <button key={a} type="button" onClick={() => patchEl(selected.id, { vAlign: a })}
                          className="flex-1 rounded px-1 py-0.5 text-[9px]"
                          style={{ background: (selected.vAlign ?? "middle") === a ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-elevated)", border: `1px solid ${(selected.vAlign ?? "middle") === a ? "var(--c-accent-blue)" : "var(--c-border)"}`, color: (selected.vAlign ?? "middle") === a ? "var(--c-accent-blue)" : "var(--c-text-muted)" }}>
                          {a === "top" ? "Arriba" : a === "middle" ? "Medio" : "Abajo"}
                        </button>
                      ))}
                    </div>
                    {/* Tipografía */}
                    <select
                      value={selected.fontFamily ?? ""}
                      onChange={(e) => patchEl(selected.id, { fontFamily: e.target.value || undefined })}
                      className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                    >
                      {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                    </select>
                  </>
                )}

                {selected.kind === "image" && (
                  <>
                    <label className="font-mono text-[9px] uppercase" style={{ color: "var(--c-text-muted)" }}>URL de la imagen</label>
                    <input
                      value={selected.src ?? ""}
                      onChange={(e) => patchEl(selected.id, { src: e.target.value })}
                      placeholder="https://…"
                      className="w-full rounded px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                    />
                    {selected.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.src} alt="" className="max-h-24 w-full rounded object-contain" style={{ background: "var(--c-bg-elevated)" }} />
                    ) : null}
                  </>
                )}

                {selected.kind === "section" && (
                  <>
                    <label className="font-mono text-[9px] uppercase" style={{ color: "var(--c-text-muted)" }}>Título de la sección</label>
                    <input
                      value={selected.text ?? ""}
                      onChange={(e) => patchEl(selected.id, { text: e.target.value })}
                      placeholder="Sección"
                      className="w-full rounded px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                    />
                    <p className="text-[10px]" style={{ color: "var(--c-text-muted)" }}>Caja de fondo para agrupar campos. Posicioná los campos encima.</p>
                  </>
                )}

                {/* Visibilidad condicional — mostrar este elemento solo si... */}
                <ConditionEditor
                  selfId={selected.id}
                  layout={layout}
                  processFields={processFields}
                  showWhen={selected.showWhen}
                  onChange={(sw) => patchEl(selected.id, { showWhen: sw })}
                />

                <div className="grid grid-cols-2 gap-1.5 text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <label key={k} className="flex items-center justify-between gap-1">
                      <span className="uppercase">{k}</span>
                      <input type="number" value={Math.round(selected[k] as number)}
                        onChange={(e) => patchEl(selected.id, { [k]: Number(e.target.value) } as Partial<LayoutElement>)}
                        className="w-12 rounded px-1 py-0.5 text-[10px] outline-none" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }} />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

// Editor de visibilidad condicional de un elemento ("mostrar solo si...").
function ConditionEditor({
  selfId,
  layout,
  processFields,
  showWhen,
  onChange,
}: {
  selfId: string;
  layout: LayoutElement[];
  processFields: FormField[];
  showWhen?: ShowWhen;
  onChange: (sw: ShowWhen | undefined) => void;
}) {
  // Campos disponibles como disparador: los campos del proceso presentes en el
  // layout (excepto el propio elemento). Sin campos → no se puede condicionar.
  const sourceFields = layout
    .filter((e) => e.kind === "field" && e.id !== selfId && e.fieldId)
    .map((e) => ({ fieldId: e.fieldId!, label: processFields.find((f) => f.id === e.fieldId)?.label ?? "(campo)" }));

  const enabled = !!showWhen;
  const needsValue = showWhen && showWhen.operator !== "isFilled" && showWhen.operator !== "isEmpty";
  const srcField = showWhen ? processFields.find((f) => f.id === showWhen.fieldId) : undefined;

  const OPS: { value: ConditionOperator; label: string }[] = [
    { value: "equals", label: "es igual a" },
    { value: "notEquals", label: "es distinto de" },
    { value: "includes", label: "contiene" },
    { value: "isFilled", label: "está completo" },
    { value: "isEmpty", label: "está vacío" },
  ];

  return (
    <div className="rounded px-2 py-2" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
      <label className="flex items-center gap-2 text-[11px]" style={{ color: enabled ? "var(--c-accent-violet)" : "var(--c-text-muted)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { fieldId: sourceFields[0]?.fieldId ?? "", operator: "equals", value: "" } : undefined)}
        />
        Mostrar solo si…
      </label>
      {enabled && (
        sourceFields.length === 0 ? (
          <p className="mt-1.5 text-[10px]" style={{ color: "var(--c-text-placeholder)" }}>
            Agregá otro campo al lienzo para usarlo como condición.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              value={showWhen!.fieldId}
              onChange={(e) => onChange({ ...showWhen!, fieldId: e.target.value })}
              className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              {sourceFields.map((s) => <option key={s.fieldId} value={s.fieldId}>{s.label}</option>)}
            </select>
            <select
              value={showWhen!.operator}
              onChange={(e) => onChange({ ...showWhen!, operator: e.target.value as ConditionOperator })}
              className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {needsValue && (() => {
              // Si el campo fuente es un select con opciones, ofrecemos un dropdown.
              const opts = srcField?.type === "select" && !srcField.source ? (srcField.options ?? []) : null;
              return opts ? (
                <select
                  value={showWhen!.value ?? ""}
                  onChange={(e) => onChange({ ...showWhen!, value: e.target.value })}
                  className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                  style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                >
                  <option value="">— Valor —</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  value={showWhen!.value ?? ""}
                  onChange={(e) => onChange({ ...showWhen!, value: e.target.value })}
                  placeholder="Valor…"
                  className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                  style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                />
              );
            })()}
          </div>
        )
      )}
    </div>
  );
}

// Preview de un elemento dentro del lienzo del builder (no interactivo).
function LayoutElementPreview({ el, field }: { el: LayoutElement; field?: FormField }) {
  if (el.kind === "divider") {
    // Línea fina centrada vertical (el alto del elemento es solo el área de agarre).
    return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: 2, background: "var(--c-border)" }} /></div>;
  }
  if (el.kind === "section") {
    return (
      <div style={{ width: "100%", height: "100%", borderRadius: 8, border: "1px solid rgb(var(--c-accent-violet-rgb) / 0.3)", background: "rgb(var(--c-accent-violet-rgb) / 0.04)", padding: "4px 8px" }}>
        <span className="font-mono text-[10px] uppercase" style={{ color: "var(--c-accent-violet)" }}>{el.text || "Sección"}</span>
      </div>
    );
  }
  if (el.kind === "image") {
    return el.src
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--c-bg-elevated)", color: "var(--c-text-muted)", fontSize: 10 }}>Imagen (URL)</div>;
  }
  if (el.kind === "title" || el.kind === "text") {
    const vAlignItems = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: vAlignItems, padding: "2px 6px", fontSize: el.fontSize ?? (el.kind === "title" ? 22 : 13), fontWeight: el.kind === "title" ? 700 : 400, fontFamily: el.fontFamily ?? "inherit", color: el.kind === "title" ? "var(--c-text-primary)" : "var(--c-text-muted)", textAlign: el.align ?? "left", justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start", overflow: "hidden" }}>
        {el.text || (el.kind === "title" ? "Título" : "Texto")}
      </div>
    );
  }
  // field
  return (
    <div style={{ width: "100%", height: "100%", padding: 6, background: "var(--c-bg-elevated)", display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--c-text-secondary)" }}>
        {field?.label ?? "(campo eliminado)"}
        {el.readOnly && <span className="rounded px-1 font-mono text-[7px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)", color: "var(--c-accent-amber)" }}>solo lec.</span>}
      </span>
      <div className="flex-1 rounded" style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", minHeight: 8 }} />
    </div>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({
  node,
  onUpdate,
  onClose,
  onOpenLayoutBuilder,
}: {
  node: BpmNode;
  onUpdate: (id: string, data: Partial<BpmData>) => void;
  onClose: () => void;
  onOpenLayoutBuilder: () => void;
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
        background: "var(--c-bg-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
          Propiedades
        </p>
        <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar" className="rounded p-1 hover:bg-[var(--c-border)]" style={{ color: "var(--c-text-muted)" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
          Nombre
        </label>
        <input
          value={node.data.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
        />
      </div>

      {(node.type !== "startEvent" && node.type !== "endEvent") && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
            Descripción
          </label>
          <textarea
            value={node.data.description ?? ""}
            onChange={(e) => onUpdate(node.id, { description: e.target.value })}
            rows={2}
            className="w-full resize-none rounded px-3 py-2 text-sm outline-none"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
          />
        </div>
      )}

      {node.type === "userTask" && (
        <>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
              Puesto responsable
            </label>
            <select
              value={selectedTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              <option value="">— Sin asignar —</option>
              {jobTitles.map((title) => (
                <option key={title} value={title}>
                  {title} ({byTitle[title].length})
                </option>
              ))}
            </select>
            {jobTitles.length === 0 && (
              <p className="mt-1 font-mono text-[9px]" style={{ color: "var(--c-text-placeholder)" }}>
                Sin puestos en el organigrama todavía
              </p>
            )}
          </div>

          {selectedTitle && byTitle[selectedTitle]?.length > 1 && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
                Persona específica (opcional)
              </label>
              <select
                value={selectedPerson}
                onChange={(e) => handlePersonChange(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
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
          <button
            type="button"
            onClick={onOpenLayoutBuilder}
            className="flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px"
            style={{ background: "var(--c-accent-blue)" }}
          >
            <LayoutTemplate className="h-4 w-4" strokeWidth={2} />
            Diseñar ventana del paso
          </button>
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
            {(node.data.layout?.length ?? 0) > 0
              ? `${node.data.layout!.length} elemento(s) en la ventana de este paso.`
              : "Sin diseño todavía. Abrí el diseñador para armar la ventana que verá quien ejecute este paso."}
          </p>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--c-text-muted)", cursor: "pointer" }}>
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
          <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
            Service action
          </label>
          <input
            value={node.data.serviceAction ?? ""}
            onChange={(e) => onUpdate(node.id, { serviceAction: e.target.value || undefined })}
            placeholder="ej: send_welcome_email"
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
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
  heatmapData,
}: {
  definition: ProcessDefinition;
  onSave: (nodes: ProcessNode[], edges: ProcessEdge[], formFields: FormField[]) => Promise<void>;
  saving: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  heatmapData?: Record<string, { color: string; label: string }>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<BpmNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<BpmNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  // Campos del formulario a nivel PROCESO (modelo "tren de carga"): se definen
  // una vez para el proceso y cada instancia acumula sus valores. La visibilidad
  // por paso (qué campos ve cada nodo) llega en Fase 2.
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  // Nodo cuyo layout visual se está diseñando (builder estilo Canva por paso).
  const [layoutBuilderNodeId, setLayoutBuilderNodeId] = useState<string | null>(null);
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
    const dbFields = definition.formFields as unknown as FormField[];
    setFormFields(Array.isArray(dbFields) ? dbFields : []);
    // El load (inicial o post-save) limpia el dirty flag.
    setIsDirty(false);
  }, [definition.id, definition.nodes, definition.edges, definition.formFields, setNodes, setEdges]);

  // Aplicar/quitar heatmap: cuando cambia heatmapData, inyectamos heatBorder
  // en cada node.data sin alterar la posición ni otros campos. Esto NO marca dirty.
  useEffect(() => {
    setNodes((curr) =>
      curr.map((n) => {
        const hit = heatmapData?.[n.id];
        if (hit) {
          return { ...n, data: { ...n.data, heatBorder: hit.color, heatLabel: hit.label } };
        }
        if (n.data.heatBorder || n.data.heatLabel) {
          // Remover heat si ya no aplica
          const cleaned = { ...n.data };
          delete cleaned.heatBorder;
          delete cleaned.heatLabel;
          return { ...n, data: cleaned };
        }
        return n;
      })
    );
  }, [heatmapData, setNodes]);

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
            style: { stroke: isGateway ? "var(--c-accent-red)" : "var(--c-accent-blue)", strokeWidth: 1.5 },
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
        if (isDirty && !saving) onSave(nodesToDB(nodes), edgesToDB(edges), formFields);
      }
      if (e.key === "Escape" && (selectedNode || selectedEdge)) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, saving, nodes, edges, formFields, onSave, selectedNode, selectedEdge]);

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

  const handleSave = () => onSave(nodesToDB(nodes), edgesToDB(edges), formFields);

  // Mutación de los campos del formulario del proceso → marca dirty.
  const handleFormFieldsChange = (fields: FormField[]) => {
    setFormFields(fields);
    setIsDirty(true);
  };

  return (
    <div className="relative flex h-full w-full">
      {/* Palette */}
      <div
        className="flex flex-col gap-1 p-3"
        style={{
          width: 180,
          background: "var(--c-bg-base)",
          borderRight: "1px solid var(--c-border)",
          flexShrink: 0,
        }}
      >
        <p
          className="mb-2 px-1 font-mono text-[9px] uppercase tracking-widest"
          style={{ color: "var(--c-text-muted)" }}
        >
          Elementos
        </p>
        {PALETTE.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              onClick={() => addNode(item.type, item.defaultLabel)}
              className="flex items-center gap-2 rounded px-2 py-2 text-left text-xs transition-colors hover:bg-[var(--c-bg-elevated)]"
              style={{ color: "var(--c-text-secondary)" }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}

        <div style={{ height: 1, background: "var(--c-border)", margin: "8px 0" }} />

        <div className="flex flex-col gap-1.5 px-1 font-mono text-[9px]" style={{ color: "var(--c-text-muted)", lineHeight: 1.5 }}>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Conectar</strong>: arrastrar desde los handles azules.</p>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Borrar</strong>: seleccionar + tecla Delete.</p>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Editar</strong>: click en nodo → panel lateral.</p>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Guardar</strong>: Ctrl+S o botón.</p>
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
          panOnDrag={[0, 1, 2]}
          zoomOnPinch={true}
          minZoom={0.2}
          maxZoom={2}
          style={{ background: "var(--c-bg-base)" }}
        >
          <Background color="var(--c-border)" gap={32} size={1} />
          <Controls style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }} />
          <Panel position="top-right" className="m-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFormBuilder(true)}
                title="Campos del formulario del proceso"
                className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-all hover:-translate-y-px"
                style={{
                  background: "var(--c-bg-surface)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-secondary)",
                }}
              >
                <ListChecks className="h-4 w-4" strokeWidth={2} />
                Campos{formFields.length > 0 ? ` (${formFields.length})` : ""}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                title={isDirty ? "Guardar cambios (Ctrl+S)" : "Sin cambios pendientes"}
                className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: isDirty ? "var(--c-accent-blue)" : "var(--c-border)",
                  boxShadow: isDirty ? "0 0 12px rgb(var(--c-accent-blue-rgb) / 0.3)" : "none",
                }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" strokeWidth={2} />
                )}
                {isDirty ? "Guardar" : "Guardado"}
              </button>
            </div>
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
            onOpenLayoutBuilder={() => setLayoutBuilderNodeId(selectedNode.id)}
          />
        </div>
      )}

      {/* Form builder a nivel proceso (modelo "tren de carga") */}
      {showFormBuilder && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "rgb(0 0 0 / 0.45)" }}
          onClick={() => setShowFormBuilder(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-[460px] flex-col rounded-lg"
            style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", boxShadow: "0 12px 48px rgb(0 0 0 / 0.4)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--c-border)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>Campos del formulario</p>
                <p className="text-[11px]" style={{ color: "var(--c-text-muted)" }}>
                  Compartidos por todo el proceso. Cada instancia acumula sus valores.
                </p>
              </div>
              <button onClick={() => setShowFormBuilder(false)} className="rounded p-1 hover:bg-[var(--c-border)]" style={{ color: "var(--c-text-muted)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <FormFieldsEditor fields={formFields} onChange={handleFormFieldsChange} />
            </div>
          </div>
        </div>
      )}

      {/* Step Layout Builder — diseñador visual de la ventana de un paso */}
      {layoutBuilderNodeId && (() => {
        const bn = nodes.find((n) => n.id === layoutBuilderNodeId);
        if (!bn) return null;
        return (
          <StepLayoutBuilder
            nodeLabel={bn.data.label}
            processFields={formFields}
            layout={bn.data.layout ?? []}
            onChange={(lay) => updateNodeData(bn.id, { layout: lay })}
            onClose={() => setLayoutBuilderNodeId(null)}
          />
        );
      })()}

      {/* Edge condition panel — solo para exclusiveGateway */}
      {selectedEdge && (
        <div className="absolute right-4 top-4 z-10">
          <div style={{ width: 240, background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.25)", borderRadius: 8, padding: 16 }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-accent-red)" }}>
                Condición de decisión
              </p>
              <button onClick={() => setSelectedEdge(null)} className="rounded p-1 hover:bg-[var(--c-border)]" style={{ color: "var(--c-text-muted)" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
              Define cuándo el flujo toma esta rama. Ej: <code style={{ color: "var(--c-accent-red)" }}>aprobado === true</code>
            </p>
            <textarea
              autoFocus
              rows={3}
              value={((selectedEdge.data as Record<string, unknown>)?.condition as string) ?? ""}
              onChange={(e) => updateEdgeCondition(selectedEdge.id, e.target.value)}
              placeholder="ej: monto > 10000"
              className="w-full resize-none rounded px-3 py-2 text-sm outline-none placeholder:text-[var(--c-text-placeholder)]"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            />
            <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--c-text-placeholder)" }}>
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
  const [auditOpen, setAuditOpen] = useState(false);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [heatmapData, setHeatmapData] = useState<Record<string, { color: string; label: string }>>({});
  const { can: canDo } = usePermissions();
  const canAudit = canDo("processes", "create");

  // Fetch heatmap data cuando se prende el toggle.
  // Calcula color por nodo basado en avgDurationMs (percentil simple).
  useEffect(() => {
    if (!heatmapOn) {
      setHeatmapData({});
      return;
    }
    fetch(`/api/processes/${processId}/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const nodeStats = data?.metrics?.nodeStats as Array<{ nodeId: string; nodeLabel: string; avgDurationMs: number }> | undefined;
        if (!Array.isArray(nodeStats) || nodeStats.length === 0) {
          setHeatmapData({});
          return;
        }
        // Calcular percentiles
        const durations = nodeStats.map((n) => n.avgDurationMs).filter((d) => d > 0);
        if (durations.length === 0) return;
        const sorted = [...durations].sort((a, b) => a - b);
        const p33 = sorted[Math.floor(sorted.length * 0.33)];
        const p66 = sorted[Math.floor(sorted.length * 0.66)];

        const map: Record<string, { color: string; label: string }> = {};
        for (const stat of nodeStats) {
          if (stat.avgDurationMs <= 0) continue;
          const color =
            stat.avgDurationMs <= p33 ? "#10D9A0" :    // verde — rápido
            stat.avgDurationMs <= p66 ? "#F59E0B" :    // ámbar — medio
            "#F43F5E";                                  // rojo — cuello de botella
          const s = stat.avgDurationMs / 1000;
          const label =
            s < 60 ? `${s.toFixed(1)}s avg` :
            s < 3600 ? `${(s / 60).toFixed(1)}m avg` :
            `${(s / 3600).toFixed(1)}h avg`;
          map[stat.nodeId] = { color, label };
        }
        setHeatmapData(map);
      })
      .catch(() => setHeatmapData({}));
  }, [heatmapOn, processId]);
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

  const handleSave = async (nodes: ProcessNode[], edges: ProcessEdge[], formFields: FormField[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/processes/${processId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes,
          edges,
          formFields,
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
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p style={{ color: "var(--c-text-muted)" }}>Proceso no encontrado</p>
        <button
          onClick={() => router.push("/dashboard/processes")}
          className="text-sm"
          style={{ color: "var(--c-accent-blue)" }}
        >
          ← Volver a procesos
        </button>
      </div>
    );
  }

  const statusColor =
    definition.status === "active"
      ? "var(--c-accent-emerald)"
      : definition.status === "archived"
      ? "var(--c-accent-amber)"
      : "var(--c-text-muted)";

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--c-bg-base)",
        ...(isFullscreen
          ? { position: "fixed", inset: 0, zIndex: 60, height: "100vh" }
          : { height: "100%" }),
      }}
    >
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-base)" }}
      >
        <button
          onClick={() => router.push("/dashboard/processes")}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors hover:bg-[var(--c-bg-elevated)]"
          style={{ color: "var(--c-text-muted)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div style={{ width: 1, height: 20, background: "var(--c-border)" }} />

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
              background: "var(--c-bg-elevated)",
              border: "1px solid var(--c-accent-blue)",
              color: "var(--c-text-primary)",
              minWidth: 200,
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={{ color: "var(--c-text-primary)" }}
          >
            {name}
          </button>
        )}

        {/* Status dropdown */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            onClick={() => setStatusOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-[var(--c-bg-elevated)]"
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
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", minWidth: 130 }}
            >
              {(["draft", "active", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className="px-3 py-2 text-left text-xs hover:bg-[var(--c-bg-elevated)]"
                  style={{ color: "var(--c-text-secondary)" }}
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
            className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={{
              color: definition.projectTemplateId ? "var(--c-accent-violet)" : "var(--c-text-muted)",
              border: `1px solid ${definition.projectTemplateId ? "rgb(var(--c-accent-violet-rgb) / 0.4)" : "var(--c-border)"}`,
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
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", minWidth: 220, maxHeight: 260, overflowY: "auto" }}
            >
              <button
                onClick={() => { handleTemplateChange(null); setTemplateOpen(false); }}
                className="px-3 py-2 text-left text-xs hover:bg-[var(--c-bg-elevated)]"
                style={{ color: definition.projectTemplateId ? "var(--c-text-muted)" : "var(--c-accent-red)", borderBottom: "1px solid var(--c-border)" }}
              >
                ✕ Sin template
              </button>
              {templates.length === 0 ? (
                <p className="px-3 py-3 text-xs italic" style={{ color: "var(--c-text-muted)" }}>
                  Creá templates en /dashboard/projects
                </p>
              ) : templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { handleTemplateChange(t.id); setTemplateOpen(false); }}
                  className="px-3 py-2 text-left text-xs hover:bg-[var(--c-bg-elevated)]"
                  style={{
                    color: definition.projectTemplateId === t.id ? "var(--c-accent-violet)" : "var(--c-text-secondary)",
                    background: definition.projectTemplateId === t.id ? "rgb(var(--c-accent-violet-rgb) / 0.08)" : "transparent",
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
        <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
          {(["test", "production"] as const).map((env) => (
            <button
              key={env}
              onClick={() => setEnvironment(env)}
              className="px-3 py-1 font-mono text-[10px] uppercase transition-colors"
              style={
                environment === env
                  ? { background: env === "test" ? "rgb(var(--c-accent-amber-rgb) / 0.15)" : "rgb(var(--c-accent-emerald-rgb) / 0.12)",
                      color: env === "test" ? "var(--c-accent-amber)" : "var(--c-accent-emerald)" }
                  : { background: "transparent", color: "var(--c-text-dim)" }
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
          <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: "var(--c-accent-red)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-accent-red)" }} />
            Sin guardar
          </span>
        )}
        {saved && (
          <span className="font-mono text-[11px]" style={{ color: "var(--c-accent-emerald)" }}>
            ✓ Guardado
          </span>
        )}

        {canAudit && (
          <button
            onClick={() => setAuditOpen(true)}
            title="Auditoría y métricas (requiere permiso de crear procesos)"
            aria-label="Auditoría y métricas"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
            style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Auditoría</span>
          </button>
        )}

        {canAudit && (
          <button
            onClick={() => setHeatmapOn((v) => !v)}
            title={heatmapOn ? "Apagar heatmap de cycle time" : "Mostrar cycle time por nodo (verde=rápido, rojo=lento)"}
            aria-label="Toggle heatmap"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
            style={{
              color: heatmapOn ? "#F43F5E" : "var(--c-text-muted)",
              border: `1px solid ${heatmapOn ? "rgb(244 63 94 / 0.4)" : "var(--c-border)"}`,
              background: heatmapOn ? "rgb(244 63 94 / 0.08)" : "transparent",
            }}
          >
            <span style={{ fontSize: 11 }}>🔥</span>
            <span className="hidden md:inline">Heatmap</span>
          </button>
        )}

        <button
          onClick={() => setIsFullscreen(v => !v)}
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
          style={{ color: isFullscreen ? "var(--c-accent-blue)" : "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
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
              background: "rgb(var(--c-accent-emerald-rgb) / 0.1)",
              color: "var(--c-accent-emerald)",
              border: "1px solid rgb(var(--c-accent-emerald-rgb) / 0.25)",
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
            heatmapData={heatmapData}
          />
        </ReactFlowProvider>
      </div>

      {auditOpen && <AuditPanel processId={processId} onClose={() => setAuditOpen(false)} />}
    </div>
  );
}
