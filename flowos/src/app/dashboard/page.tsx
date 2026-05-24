"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useUser, useOrganization } from "@clerk/nextjs";
import {
  ArrowUpRight, GitBranch, Users, Workflow, FileText, CheckSquare, Inbox,
  Plus, X, TrendingUp, TrendingDown, Minus,
  Settings2, Loader2, Sparkles, Maximize2,
  type LucideIcon,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type MetricKey =
  | "employees_active"
  | "employees_total"
  | "departments_count"
  | "divisions_count"
  | "projects_count"
  | "tasks_open"
  | "tasks_done"
  | "processes_active"
  | "instances_running"
  | "inbox_pending"
  | "inbox_completed"
  | "documents_count";

type Widget = {
  id: string;
  metric: MetricKey;
  label: string;
  customLabel?: string;
};

interface MetricSpec {
  key: MetricKey;
  label: string;
  icon: LucideIcon;
  color: string;
  fetch: () => Promise<number>;
}

// ─── Metric specs ────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const METRICS: MetricSpec[] = [
  {
    key: "employees_active", label: "Empleados activos", icon: Users, color: "var(--c-accent-blue)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/employees");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "employees_total", label: "Total empleados (incl. archivados)", icon: Users, color: "var(--c-text-muted)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/employees?includeInactive=true");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "divisions_count", label: "Divisiones", icon: GitBranch, color: "var(--c-accent-violet)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/divisions");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "departments_count", label: "Departamentos", icon: GitBranch, color: "var(--c-accent-pink)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/departments");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "projects_count", label: "Proyectos", icon: CheckSquare, color: "var(--c-accent-emerald)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/projects");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "tasks_open", label: "Tareas abiertas", icon: CheckSquare, color: "var(--c-accent-amber)",
    fetch: async () => {
      const projs = await fetchJson<{ id: string }[]>("/api/projects");
      if (!Array.isArray(projs)) return 0;
      // Fetch paralelo via Promise.all — con 50 proyectos antes eran ~5s secuencial, ahora ~500ms.
      const taskLists = await Promise.all(
        projs.map(p => fetchJson<{ status: string }[]>(`/api/tasks?projectId=${p.id}`))
      );
      return taskLists.reduce<number>((sum, tasks) => {
        return sum + (Array.isArray(tasks) ? tasks.filter(t => t.status !== "done").length : 0);
      }, 0);
    },
  },
  {
    key: "tasks_done", label: "Tareas completadas", icon: CheckSquare, color: "var(--c-accent-emerald)",
    fetch: async () => {
      const projs = await fetchJson<{ id: string }[]>("/api/projects");
      if (!Array.isArray(projs)) return 0;
      // Fetch paralelo igual que tasks_open.
      const taskLists = await Promise.all(
        projs.map(p => fetchJson<{ status: string }[]>(`/api/tasks?projectId=${p.id}`))
      );
      return taskLists.reduce<number>((sum, tasks) => {
        return sum + (Array.isArray(tasks) ? tasks.filter(t => t.status === "done").length : 0);
      }, 0);
    },
  },
  {
    key: "processes_active", label: "Procesos activos", icon: Workflow, color: "var(--c-accent-blue)",
    fetch: async () => {
      const data = await fetchJson<{ status: string }[]>("/api/processes");
      return Array.isArray(data) ? data.filter(p => p.status === "active").length : 0;
    },
  },
  {
    key: "instances_running", label: "Instancias en curso", icon: Workflow, color: "var(--c-accent-amber)",
    fetch: async () => {
      const data = await fetchJson<{ status: string }[]>("/api/instances");
      return Array.isArray(data) ? data.filter(i => i.status === "running").length : 0;
    },
  },
  {
    key: "inbox_pending", label: "Bandeja: pendientes", icon: Inbox, color: "var(--c-accent-red)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/inbox?status=pending");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "inbox_completed", label: "Bandeja: completadas", icon: Inbox, color: "var(--c-accent-emerald)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/inbox?status=completed");
      return Array.isArray(data) ? data.length : 0;
    },
  },
  {
    key: "documents_count", label: "Documentos", icon: FileText, color: "var(--c-accent-cyan)",
    fetch: async () => {
      const data = await fetchJson<unknown[]>("/api/documents");
      return Array.isArray(data) ? data.length : 0;
    },
  },
];

const METRICS_BY_KEY: Record<MetricKey, MetricSpec> = METRICS.reduce(
  (acc, m) => { acc[m.key] = m; return acc; },
  {} as Record<MetricKey, MetricSpec>,
);

const DEFAULT_WIDGETS: Widget[] = [
  { id: "w1", metric: "employees_active", label: "Empleados activos" },
  { id: "w2", metric: "projects_count", label: "Proyectos" },
  { id: "w3", metric: "tasks_open", label: "Tareas abiertas" },
  { id: "w4", metric: "inbox_pending", label: "Bandeja" },
];

// ─── Time-series mock (until we add real history) ────────────────────────────

function generateTimeSeries(currentValue: number, days = 30): { date: string; value: number }[] {
  const series: { date: string; value: number }[] = [];
  const now = Date.now();
  let v = Math.max(0, Math.round(currentValue * 0.6));
  for (let i = days; i >= 0; i--) {
    const noise = Math.random() * 0.15 - 0.05;
    v = Math.max(0, Math.round(v + (currentValue - v) * 0.08 + currentValue * noise));
    if (i === 0) v = currentValue;
    series.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      value: v,
    });
  }
  return series;
}

// ─── Simple SVG line chart ───────────────────────────────────────────────────

function LineChart({ data, color, height = 180 }: {
  data: { date: string; value: number }[];
  color: string;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (data.length === 0) return null;

  const max = Math.max(...data.map(d => d.value), 1);
  const min = 0;
  const w = 600;
  const h = height;
  const padX = 40;
  const padY = 20;

  const points = data.map((d, i) => {
    const x = padX + ((w - padX * 2) * i) / Math.max(data.length - 1, 1);
    const y = padY + ((max - d.value) / (max - min || 1)) * (h - padY * 2);
    return { x, y, d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const fillPath = `${path} L ${points[points.length - 1].x} ${h - padY} L ${points[0].x} ${h - padY} Z`;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Y-axis grid */}
        {[0.25, 0.5, 0.75].map(p => {
          const y = padY + p * (h - padY * 2);
          return <line key={p} x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--c-border)" strokeWidth="0.5" strokeDasharray="3 3" />;
        })}
        {/* Fill */}
        <defs>
          <linearGradient id={`grad-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#grad-${color.slice(1)})`} />
        {/* Line */}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Hover dots */}
        {points.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - 12} y={0} width={24} height={h}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "crosshair" }}
            />
            {hoverIdx === i && (
              <>
                <line x1={p.x} y1={padY} x2={p.x} y2={h - padY} stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                <circle cx={p.x} cy={p.y} r="5" fill={color} />
                <circle cx={p.x} cy={p.y} r="2.5" fill="var(--c-bg-surface)" />
              </>
            )}
          </g>
        ))}
        {/* X-axis labels */}
        {[0, Math.floor(data.length / 2), data.length - 1].map(i => {
          const p = points[i];
          if (!p) return null;
          const label = new Date(p.d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
          return <text key={i} x={p.x} y={h - 4} textAnchor="middle" fontSize="9" fill="var(--c-text-muted)" fontFamily="monospace">{label}</text>;
        })}
      </svg>
      {hoverIdx !== null && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6,
          padding: "6px 10px", fontSize: 11, color: "var(--c-text-primary)",
          fontFamily: "monospace", pointerEvents: "none",
        }}>
          <div style={{ color: "var(--c-text-muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {new Date(points[hoverIdx].d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
          <div style={{ color, fontSize: 16, fontWeight: 700 }}>{points[hoverIdx].d.value}</div>
        </div>
      )}
    </div>
  );
}

// ─── Widget detail modal ─────────────────────────────────────────────────────

function WidgetDetailModal({ widget, value, onClose }: {
  widget: Widget; value: number | null; onClose: () => void;
}) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "365d">("30d");
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
  const spec = METRICS_BY_KEY[widget.metric];
  const Icon = spec.icon;

  // Fetch del histórico real (snapshots diarios). Si no hay datos, cae al mock.
  const [realSeries, setRealSeries] = useState<{ date: string; value: number }[] | null>(null);
  useEffect(() => {
    fetch(`/api/metrics/timeseries?metric=${encodeURIComponent(widget.metric)}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.series)) setRealSeries(data.series);
      })
      .catch(() => setRealSeries([]));
  }, [widget.metric, days]);

  const mockSeries = useMemo(() => generateTimeSeries(value ?? 0, days), [value, days]);

  // Si hay al menos 3 días reales → usar reales. Sino mock (con badge informativo).
  const hasRealData = realSeries !== null && realSeries.length >= 3;
  const series = hasRealData ? realSeries! : mockSeries;
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const change = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendColor = change > 0 ? "var(--c-accent-emerald)" : change < 0 ? "var(--c-accent-red)" : "var(--c-text-muted)";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 12,
        width: "100%", maxWidth: 720, maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${spec.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={18} style={{ color: spec.color }} strokeWidth={1.75} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>{widget.customLabel ?? spec.label}</p>
            <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "2px 0 0", fontFamily: "monospace" }}>
              vista detallada · serie temporal
            </p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        {/* Stats row */}
        <div style={{ padding: "20px", display: "flex", gap: 28, alignItems: "center", borderBottom: "1px solid var(--c-border)" }}>
          <div>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px", fontFamily: "monospace" }}>
              Valor actual
            </p>
            <p style={{ fontSize: 32, fontWeight: 700, color: spec.color, margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {value ?? "—"}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px", fontFamily: "monospace" }}>
              Cambio en {days}d
            </p>
            <p style={{ fontSize: 24, fontWeight: 700, color: trendColor, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendIcon size={20} />
              {change > 0 ? "+" : ""}{change}%
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "var(--c-bg-elevated)", borderRadius: 6, padding: 3, border: "1px solid var(--c-border)" }}>
            {(["7d", "30d", "90d", "365d"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{
                  padding: "5px 10px", fontSize: 11, border: "none", cursor: "pointer",
                  borderRadius: 4, fontFamily: "monospace",
                  background: period === p ? spec.color : "transparent",
                  color: period === p ? "#fff" : "var(--c-text-muted)",
                }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{ padding: 20, flex: 1, overflow: "auto" }}>
          <LineChart data={series} color={spec.color} height={220} />
          <p style={{ fontSize: 10, color: hasRealData ? "var(--c-accent-emerald)" : "var(--c-text-muted)", margin: "12px 0 0", textAlign: "center", fontFamily: "monospace" }}>
            {hasRealData
              ? `● Datos reales · ${realSeries!.length} snapshots históricos`
              : "ⓘ Serie estimada — los datos reales se acumulan diariamente (cron de snapshot)"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Add widget picker ───────────────────────────────────────────────────────

function AddWidgetPicker({ usedKeys, onAdd, onClose }: {
  usedKeys: Set<MetricKey>;
  onAdd: (key: MetricKey) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 12,
        width: "100%", maxWidth: 540, maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>Agregar widget</p>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {METRICS.map(m => {
            const Icon = m.icon;
            const used = usedKeys.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => { onAdd(m.key); onClose(); }}
                disabled={used}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: 12, background: used ? "var(--c-bg-base)" : "var(--c-bg-elevated)",
                  border: "1px solid var(--c-border)", borderRadius: 8,
                  cursor: used ? "not-allowed" : "pointer",
                  textAlign: "left", opacity: used ? 0.5 : 1,
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 6, background: `${m.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} style={{ color: m.color }} strokeWidth={1.75} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.label}
                  </p>
                  {used && <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "2px 0 0" }}>Ya agregado</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Widget card ──────────────────────────────────────────────────────────────

function WidgetCard({ widget, value, loading, editing, onRemove, onClick }: {
  widget: Widget;
  value: number | null;
  loading: boolean;
  editing: boolean;
  onRemove: () => void;
  onClick: () => void;
}) {
  const spec = METRICS_BY_KEY[widget.metric];
  const Icon = spec.icon;

  return (
    <div
      onClick={editing ? undefined : onClick}
      style={{
        position: "relative",
        padding: 18,
        background: "var(--c-bg-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: 10,
        cursor: editing ? "default" : "pointer",
        transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease, box-shadow 180ms ease",
      }}
      onMouseEnter={e => {
        if (editing) return;
        e.currentTarget.style.borderColor = spec.color;
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = `0 12px 32px ${spec.color}33, 0 0 0 1px ${spec.color}1a inset`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--c-border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {editing && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 22, height: 22, borderRadius: "50%",
            background: "rgb(var(--c-accent-red-rgb) / 0.15)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.3)",
            color: "var(--c-accent-red)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={11} />
        </button>
      )}
      {!editing && (
        <Maximize2 size={11} style={{ position: "absolute", top: 12, right: 12, color: "var(--c-text-muted)", opacity: 0.5 }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 6, background: `${spec.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} style={{ color: spec.color }} strokeWidth={1.75} />
        </div>
        <p style={{ fontSize: 12, color: "var(--c-text-muted)", margin: 0, lineHeight: 1.3, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {widget.customLabel ?? spec.label}
        </p>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "var(--c-text-primary)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {loading ? <Loader2 size={20} className="animate-spin" style={{ color: spec.color }} /> : (value ?? "—")}
      </div>
    </div>
  );
}

// ─── Stats section ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:   "var(--c-accent-emerald)",
  vacation: "var(--c-accent-blue)",
  leave:    "var(--c-accent-amber)",
  inactive: "var(--c-text-muted)",
};
const STATUS_LABELS: Record<string, string> = {
  active:   "Activos",
  vacation: "Vacaciones",
  leave:    "Licencia",
  inactive: "Inactivos",
};

interface EmpRow { status: string; departmentId: string | null; }
interface DeptRow { id: string; name: string; }

function StatsSection() {
  const [emps, setEmps] = useState<EmpRow[]>([]);
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [e, d] = await Promise.all([
        fetchJson<EmpRow[]>("/api/employees?includeInactive=true"),
        fetchJson<DeptRow[]>("/api/departments"),
      ]);
      if (!cancelled) {
        setEmps(Array.isArray(e) ? e : []);
        setDepts(Array.isArray(d) ? d : []);
        setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    emps.forEach(e => { counts[e.status] = (counts[e.status] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([status, value]) => ({ name: STATUS_LABELS[status] ?? status, value, status }))
      .sort((a, b) => b.value - a.value);
  }, [emps]);

  const deptData = useMemo(() => {
    const deptMap = new Map(depts.map(d => [d.id, d.name]));
    const counts: Record<string, number> = {};
    emps.forEach(e => {
      if (!e.departmentId) return;
      const name = deptMap.get(e.departmentId) ?? "Sin depto";
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.length > 14 ? name.slice(0, 13) + "…" : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [emps, depts]);

  if (statsLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--c-accent-blue)" }} />
      </div>
    );
  }

  if (emps.length === 0) return null;

  const tooltipStyle = {
    background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 8,
    fontSize: 12, color: "var(--c-text-primary)",
  };

  return (
    <section style={{ marginTop: 36 }}>
      <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px", fontFamily: "monospace" }}>
        Análisis
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 12, alignItems: "start" }}>

        {/* Pie: empleados por estado */}
        <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 10, padding: "16px 12px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--c-text-muted)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace" }}>
            Empleados por estado
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
              >
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.status] ?? "var(--c-accent-blue)"} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--c-text-primary)" }} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span style={{ fontSize: 11, color: "var(--c-text-muted)" }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar: empleados por departamento */}
        <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 10, padding: "16px 12px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--c-text-muted)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace" }}>
            Empleados por departamento
          </p>
          {deptData.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--c-text-muted)", textAlign: "center", padding: "24px 0" }}>Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={deptData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--c-text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--c-text-secondary)" }} axisLine={false} tickLine={false} width={96} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--c-text-primary)" }} cursor={{ fill: "rgb(var(--c-accent-blue-rgb) / 0.07)" }} />
                <Bar dataKey="value" name="Empleados" fill="var(--c-accent-blue)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardHome() {
  const { user } = useUser();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [openWidget, setOpenWidget] = useState<Widget | null>(null);

  // Load widgets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("flowos-dashboard-widgets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setWidgets(parsed);
      }
    } catch {}
  }, []);

  // Persist widgets
  useEffect(() => {
    try { localStorage.setItem("flowos-dashboard-widgets", JSON.stringify(widgets)); } catch {}
  }, [widgets]);

  // Fetch metric values
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const results: Record<string, number | null> = {};
      const uniqueMetrics = Array.from(new Set(widgets.map(w => w.metric)));
      await Promise.all(uniqueMetrics.map(async key => {
        try {
          const v = await METRICS_BY_KEY[key].fetch();
          results[key] = v;
        } catch {
          results[key] = null;
        }
      }));
      if (!cancelled) {
        setValues(results);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widgets]);

  const addWidget = (metric: MetricKey) => {
    setWidgets(prev => [...prev, {
      id: `w-${Date.now()}`,
      metric,
      label: METRICS_BY_KEY[metric].label,
    }]);
  };

  const removeWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const usedKeys = new Set(widgets.map(w => w.metric));
  const firstName = user?.firstName ?? "amigo";

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(16px, 4vw, 32px) 64px" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px", fontFamily: "monospace" }}>
          {getGreeting()}
        </p>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--c-text-primary)", margin: 0, lineHeight: 1.2 }}>
          Hola, {firstName}.{" "}
          <span style={{ color: "var(--c-text-muted)" }}>¿Qué medimos hoy?</span>
        </h2>
      </div>

      {/* Stats dashboard */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0, fontFamily: "monospace" }}>
            Indicadores
          </p>
          {isAdmin && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowPicker(true)} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                background: "rgb(var(--c-accent-blue-rgb) / 0.12)", border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.3)",
                color: "var(--c-accent-blue)", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
                <Plus size={12} strokeWidth={2.5} />
                Agregar
              </button>
              <button onClick={() => setEditing(v => !v)} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                background: editing ? "rgb(var(--c-accent-amber-rgb) / 0.18)" : "transparent",
                border: editing ? "1px solid rgb(var(--c-accent-amber-rgb) / 0.4)" : "1px solid var(--c-border)",
                color: editing ? "var(--c-accent-amber)" : "var(--c-text-muted)",
                borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}>
                <Settings2 size={12} />
                {editing ? "Listo" : "Editar"}
              </button>
            </div>
          )}
        </div>

        {widgets.length === 0 ? (
          <div style={{
            padding: "48px 24px", textAlign: "center",
            border: "1px dashed var(--c-border)", borderRadius: 12, background: "var(--c-bg-surface)",
          }}>
            <Sparkles size={28} style={{ color: "var(--c-border)", margin: "0 auto 10px", display: "block" }} strokeWidth={1.5} />
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>Tu dashboard está vacío</p>
            <p style={{ fontSize: 12, color: "var(--c-text-muted)", margin: "6px 0 14px" }}>
              Agregá widgets para ver métricas en tiempo real.
            </p>
            <button onClick={() => setShowPicker(true)} style={{
              background: "var(--c-accent-blue)", color: "#fff", border: "none", borderRadius: 6,
              padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              Agregar primer widget
            </button>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}>
            {widgets.map(w => (
              <WidgetCard
                key={w.id}
                widget={w}
                value={values[w.metric] ?? null}
                loading={loading}
                editing={editing}
                onRemove={() => removeWidget(w.id)}
                onClick={() => setOpenWidget(w)}
              />
            ))}
          </div>
        )}
      </section>

      <StatsSection />

      {/* Quick actions */}
      <section style={{ marginTop: 36 }}>
        <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px", fontFamily: "monospace" }}>
          Acciones rápidas
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <ActionCard href="/dashboard/orgchart" icon={GitBranch} title="Diseñar org chart"
            description="Visualizá la estructura del equipo." accentColor="var(--c-accent-blue)" />
          <ActionCard href="/dashboard/processes" icon={Workflow} title="Crear proceso"
            description="Definí flujos de trabajo automatizables." accentColor="var(--c-accent-emerald)" />
          <ActionCard href="/dashboard/projects" icon={CheckSquare} title="Nuevo proyecto"
            description="Organizá tareas y miembros." accentColor="var(--c-accent-amber)" />
          <ActionCard href="/dashboard/inbox" icon={Inbox} title="Bandeja"
            description="Resolvé tus tareas pendientes." accentColor="var(--c-accent-red)" />
        </div>
      </section>

      {/* Picker / detail modals */}
      {showPicker && (
        <AddWidgetPicker usedKeys={usedKeys} onAdd={addWidget} onClose={() => setShowPicker(false)} />
      )}
      {openWidget && (
        <WidgetDetailModal
          widget={openWidget}
          value={values[openWidget.metric] ?? null}
          onClose={() => setOpenWidget(null)}
        />
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Madrugada";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function ActionCard({ href, icon: Icon, title, description, accentColor }: {
  href: string; icon: LucideIcon; title: string; description: string; accentColor: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        minHeight: 116, padding: 16,
        background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 10,
        textDecoration: "none",
        transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease, box-shadow 180ms ease",
        position: "relative", overflow: "hidden",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = accentColor;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 10px 28px ${accentColor}26, 0 0 0 1px ${accentColor}14 inset`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--c-border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Icon size={18} style={{ color: accentColor }} strokeWidth={1.75} />
        <ArrowUpRight size={13} style={{ color: "var(--c-text-muted)" }} strokeWidth={1.5} />
      </div>
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>{title}</p>
        <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "3px 0 0", lineHeight: 1.4 }}>{description}</p>
      </div>
    </Link>
  );
}
