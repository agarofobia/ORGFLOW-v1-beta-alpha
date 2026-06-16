"use client";

// Topología BPM del editor: tipo de dato del nodo (BpmData), helpers de conversión
// DB ↔ ReactFlow, componentes visuales de cada nodo, el mapa nodeTypes y la paleta.
import { Handle, Position, type Node, type Edge } from "@xyflow/react";
import { Circle, User, Settings, Zap, GitMerge, GitBranch, Bell, Clock, Workflow } from "lucide-react";
import type { LayoutElement, ProcessNode, ProcessEdge, StepAction, NotifyConfig, TimerConfig, CallProcessConfig } from "@/lib/process-types";

// Formatea una duración en ms a texto corto ("2 d", "3 h", "15 min"). Compartido
// entre el nodo del editor y el dashboard de instancias.
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "0";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hours = Math.round(ms / 3600000);
  if (hours < 48) return `${hours} h`;
  const days = Math.round(ms / 86400000);
  return `${days} d`;
}

// ─── Node data type ───────────────────────────────────────────────────────────

export type BpmData = {
  label: string;
  description?: string;
  assigneeDeptId?: string;
  serviceAction?: string;
  // Layout visual de la ventana de este paso (builder estilo Canva, por paso).
  layout?: LayoutElement[];
  // Acciones/decisiones del paso (solo userTask).
  actions?: StepAction[];
  // Config de notificación (solo notifyTask).
  notify?: NotifyConfig;
  // Config de timer/espera (solo timerTask).
  timer?: TimerConfig;
  // Config de "llamar proceso" (solo callProcessTask).
  callProcess?: CallProcessConfig;
  allowTracking?: boolean;
  // Heatmap overlay — cuando está activo en el editor, este campo se inyecta
  // con el color calculado del cycle time del nodo (verde rápido → rojo lento).
  heatBorder?: string;
  heatLabel?: string;  // ej "23s avg" para tooltip
};

export type BpmNode = Node<BpmData>;

// ─── Conversion helpers ───────────────────────────────────────────────────────

export function nodesToDB(rfNodes: BpmNode[]): ProcessNode[] {
  return rfNodes.map((n) => ({
    id: n.id,
    type: n.type!,
    label: n.data.label,
    description: n.data.description,
    assigneeDeptId: n.data.assigneeDeptId,
    serviceAction: n.data.serviceAction,
    layout: n.data.layout,
    actions: n.data.actions,
    notify: n.data.notify,
    timer: n.data.timer,
    callProcess: n.data.callProcess,
    position: n.position,
  }));
}

export function nodesFromDB(dbNodes: ProcessNode[]): BpmNode[] {
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
      actions: n.actions,
      notify: n.notify,
      timer: n.timer,
      callProcess: n.callProcess,
    },
  }));
}

export function edgesToDB(rfEdges: Edge[]): ProcessEdge[] {
  return rfEdges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    label: typeof e.label === "string" ? e.label : undefined,
    condition: (e.data as Record<string, unknown>)?.condition as string | undefined,
  }));
}

export function edgesFromDB(dbEdges: ProcessEdge[]): Edge[] {
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

function NotifyTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-cyan-rgb) / 0.25)", borderLeft: "3px solid var(--c-accent-cyan)" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-cyan)", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgb(var(--c-accent-cyan-rgb) / 0.15)" }}>
          <Bell className="h-3.5 w-3.5" style={{ color: "var(--c-accent-cyan)" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "var(--c-text-primary)" }}>{data.label}</p>
          {data.notify && (
            <p className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>
              → {data.notify.toKind === "initiator" ? "iniciador" : data.notify.toKind === "actor" ? "actor previo" : "puesto"}
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-cyan)", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function TimerTaskNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.25)", borderLeft: "3px solid var(--c-accent-amber)" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-amber)", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)" }}>
          <Clock className="h-3.5 w-3.5" style={{ color: "var(--c-accent-amber)" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "var(--c-text-primary)" }}>{data.label}</p>
          {data.timer && data.timer.durationMs > 0 && (
            <p className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>
              ⏱ esperar {formatDuration(data.timer.durationMs)}
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-amber)", width: 8, height: 8, border: "none" }} />
    </div>
  );
}

function CallProcessNode({ data }: { data: BpmData }) {
  return (
    <div className="relative min-w-[160px] rounded-lg p-3"
      style={{ background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-emerald-rgb) / 0.25)", borderLeft: "3px solid var(--c-accent-emerald)" }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "var(--c-accent-emerald)", width: 8, height: 8, border: "none" }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: "rgb(var(--c-accent-emerald-rgb) / 0.15)" }}>
          <Workflow className="h-3.5 w-3.5" style={{ color: "var(--c-accent-emerald)" }} />
        </div>
        <div>
          <p className="text-xs font-medium leading-tight" style={{ color: "var(--c-text-primary)" }}>{data.label}</p>
          <p className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>
            {data.callProcess?.targetProcessId ? "→ dispara proceso" : "sin proceso destino"}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "var(--c-accent-emerald)", width: 8, height: 8, border: "none" }} />
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

export const nodeTypes = {
  startEvent: StartEventNode,
  endEvent: EndEventNode,
  userTask: UserTaskNode,
  serviceTask: ServiceTaskNode,
  automatedTask: AutomatedTaskNode,
  notifyTask: NotifyTaskNode,
  timerTask: TimerTaskNode,
  callProcessTask: CallProcessNode,
  parallelGateway: ParallelGatewayNode,
  exclusiveGateway: ExclusiveGatewayNode,
};

// ─── Palette config ───────────────────────────────────────────────────────────

export const PALETTE = [
  { type: "startEvent", label: "Inicio", icon: Circle, color: "var(--c-accent-emerald)", defaultLabel: "Inicio" },
  { type: "endEvent", label: "Fin", icon: Circle, color: "var(--c-accent-red)", defaultLabel: "Fin" },
  { type: "userTask", label: "Tarea humana", icon: User, color: "var(--c-accent-blue)", defaultLabel: "Nueva tarea" },
  { type: "serviceTask", label: "Servicio", icon: Settings, color: "var(--c-accent-amber)", defaultLabel: "Servicio" },
  { type: "automatedTask", label: "Automática", icon: Zap, color: "var(--c-accent-violet)", defaultLabel: "Tarea automática" },
  { type: "notifyTask", label: "Notificación", icon: Bell, color: "var(--c-accent-cyan)", defaultLabel: "Notificar" },
  { type: "timerTask", label: "Timer / Espera", icon: Clock, color: "var(--c-accent-amber)", defaultLabel: "Esperar" },
  { type: "callProcessTask", label: "Llamar proceso", icon: Workflow, color: "var(--c-accent-emerald)", defaultLabel: "Disparar proceso" },
  { type: "parallelGateway", label: "Gateway paralelo", icon: GitMerge, color: "var(--c-accent-amber)", defaultLabel: "Paralelo" },
  { type: "exclusiveGateway", label: "Gateway exclusivo", icon: GitBranch, color: "var(--c-accent-red)", defaultLabel: "Decisión" },
];
