"use client";

// Dashboard de instancias de un proceso: tabla de ejecuciones (estado, paso actual,
// quién, cuándo, duración, atascada) + detalle (timeline de pasos + datos cargados).
import { useEffect, useState } from "react";
import { X, Loader2, Activity, Clock, ChevronRight, CheckCircle2, Circle, AlertCircle } from "lucide-react";

type HistEntry = {
  nodeId: string;
  nodeLabel: string;
  startedAt: string;
  completedAt?: string;
  status: "in_progress" | "completed" | "skipped";
  completedBy?: string;
  output?: Record<string, unknown>;
};
type Instance = {
  id: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  currentNodeId: string;
  startedBy: string;
  startedAt: string;
  completedAt: string | null;
  // Timer/Espera: si != null y en el futuro, la instancia duerme hasta esa fecha.
  resumeAt: string | null;
  context: Record<string, unknown>;
  history: HistEntry[];
};

const STATUS_META: Record<Instance["status"], { label: string; color: string }> = {
  running: { label: "Corriendo", color: "var(--c-accent-blue)" },
  paused: { label: "Pausada", color: "var(--c-accent-amber)" },
  completed: { label: "Completada", color: "var(--c-accent-emerald)" },
  failed: { label: "Fallida", color: "var(--c-accent-red)" },
  cancelled: { label: "Cancelada", color: "var(--c-text-muted)" },
};

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "recién";
  if (diff < 3600000) return `hace ${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
// Tiempo restante hasta una fecha futura ("en 2h", "en 3d"). Para instancias dormidas.
function fmtUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "pronto";
  if (diff < 3600000) return `en ${Math.max(1, Math.floor(diff / 60000))}m`;
  if (diff < 86400000) return `en ${Math.floor(diff / 3600000)}h`;
  return `en ${Math.floor(diff / 86400000)}d`;
}

export default function InstancesPanel({
  processId,
  nodes,
  formFields,
  onClose,
}: {
  processId: string;
  nodes: { id: string; label: string; expectedDurationMs?: number | null }[];
  formFields: { id: string; label: string }[];
  onClose: () => void;
}) {
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [selected, setSelected] = useState<Instance | null>(null);

  useEffect(() => {
    fetch(`/api/processes/${processId}/instances`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setInstances(Array.isArray(data) ? data : []))
      .catch(() => setInstances([]));
  }, [processId]);

  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? "—";
  const fieldLabel = (id: string) => formFields.find((f) => f.id === id)?.label ?? id;

  // Atascada: corriendo y el paso actual supera su SLA.
  const isStuck = (i: Instance): boolean => {
    if (i.status !== "running") return false;
    const node = nodes.find((n) => n.id === i.currentNodeId);
    if (!node?.expectedDurationMs) return false;
    const step = [...i.history].reverse().find((h) => h.nodeId === i.currentNodeId && h.status === "in_progress");
    if (!step) return false;
    return Date.now() - new Date(step.startedAt).getTime() > node.expectedDurationMs;
  };

  const durationOf = (i: Instance) =>
    fmtDuration((i.completedAt ? new Date(i.completedAt).getTime() : Date.now()) - new Date(i.startedAt).getTime());

  // Dormida en un nodo timer: corriendo, con resumeAt en el futuro.
  const isWaiting = (i: Instance): boolean =>
    i.status === "running" && !!i.resumeAt && new Date(i.resumeAt).getTime() > Date.now();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgb(0 0 0 / 0.55)", backdropFilter: "blur(3px)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl" style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", boxShadow: "0 24px 80px var(--c-shadow-heavy)" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--c-border)" }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.15)", color: "var(--c-accent-blue)" }}><Activity className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>{selected ? `Instancia ${selected.id.slice(0, 8)}` : "Instancias del proceso"}</p>
              <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>{selected ? STATUS_META[selected.status].label : `${instances?.length ?? 0} ejecución(es)`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selected && <button onClick={() => setSelected(null)} className="rounded px-2.5 py-1 text-xs" style={{ color: "var(--c-text-secondary)", border: "1px solid var(--c-border)" }}>← Volver</button>}
            <button onClick={onClose} className="rounded p-1 hover:bg-[var(--c-bg-elevated)]" style={{ color: "var(--c-text-muted)" }}><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {instances === null ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--c-accent-blue)" }} /></div>
          ) : selected ? (
            /* ── Detalle ── */
            <div className="px-5 py-4">
              {/* Timeline */}
              <p className="mb-2.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Recorrido</p>
              <div className="mb-5 flex flex-col">
                {selected.history.map((h, i) => {
                  const dur = h.completedAt ? fmtDuration(new Date(h.completedAt).getTime() - new Date(h.startedAt).getTime()) : null;
                  const StatusIcon = h.status === "completed" ? CheckCircle2 : h.status === "in_progress" ? Circle : AlertCircle;
                  const color = h.status === "completed" ? "var(--c-accent-emerald)" : h.status === "in_progress" ? "var(--c-accent-blue)" : "var(--c-text-dim)";
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <StatusIcon className="h-4 w-4 shrink-0" style={{ color }} />
                        {i < selected.history.length - 1 && <div className="my-0.5 w-px flex-1" style={{ background: "var(--c-border)", minHeight: 18 }} />}
                      </div>
                      <div className="pb-3">
                        <p className="text-[13px] font-medium" style={{ color: "var(--c-text-primary)" }}>{h.nodeLabel}</p>
                        <p className="font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>
                          {fmtWhen(h.startedAt)}{dur ? ` · ${dur}` : h.status === "in_progress" ? " · en curso" : ""}
                          {h.completedBy && h.completedBy !== "system" ? ` · ${h.completedBy.slice(0, 10)}` : h.completedBy === "system" ? " · auto" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Datos cargados */}
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Datos cargados</p>
              {Object.keys(selected.context).length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--c-text-placeholder)" }}>Sin datos.</p>
              ) : (
                <div className="flex flex-col gap-1 rounded-lg p-3" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
                  {Object.entries(selected.context).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 text-xs">
                      <span style={{ color: "var(--c-text-muted)" }}>{k === "decision" ? "Decisión" : fieldLabel(k)}</span>
                      <span className="text-right font-medium" style={{ color: "var(--c-text-primary)" }}>{formatVal(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-dim)" }}><Activity className="h-5 w-5" /></span>
              <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>Todavía no se inició ninguna instancia de este proceso.</p>
            </div>
          ) : (
            /* ── Lista ── */
            <div className="flex flex-col">
              {instances.map((i) => {
                const meta = STATUS_META[i.status];
                const stuck = isStuck(i);
                const waiting = isWaiting(i);
                return (
                  <button key={i.id} onClick={() => setSelected(i)} className="flex items-center gap-3 border-b px-5 py-3 text-left transition-colors hover:bg-[var(--c-bg-elevated)]" style={{ borderColor: "var(--c-border)" }}>
                    <span className="flex h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color, boxShadow: i.status === "running" ? `0 0 8px ${meta.color}` : "none" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium" style={{ color: "var(--c-text-primary)" }}>{i.status === "running" || i.status === "paused" ? nodeLabel(i.currentNodeId) : meta.label}</span>
                        {waiting && <span className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.12)", color: "var(--c-accent-amber)" }}><Clock className="h-2.5 w-2.5" /> esperando · despierta {fmtUntil(i.resumeAt!)}</span>}
                        {stuck && !waiting && <span className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase" style={{ background: "rgb(var(--c-accent-red-rgb) / 0.12)", color: "var(--c-accent-red)" }}><Clock className="h-2.5 w-2.5" /> atascada</span>}
                      </div>
                      <p className="font-mono text-[9px]" style={{ color: "var(--c-text-muted)" }}>
                        {i.id.slice(0, 8)} · {fmtWhen(i.startedAt)} · {durationOf(i)}{i.startedBy && i.startedBy !== "system" ? ` · ${i.startedBy.slice(0, 10)}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded px-2 py-0.5 font-mono text-[9px] uppercase" style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}>{meta.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--c-text-dim)" }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const f = v as { name?: string };
    return f.name ?? "(archivo)";
  }
  return String(v);
}
