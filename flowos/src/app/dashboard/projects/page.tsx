"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Trash2, LayoutGrid, List, ChevronDown, ChevronRight,
  X, Calendar, User, Flag, AlignLeft, Settings2, Loader2,
  CheckCircle2, Circle, Clock, ArrowLeft, Folder, Users as UsersIcon,
  TrendingUp, Search, Filter, GripVertical, Upload, FileText,
} from "lucide-react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, closestCenter,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useToast } from "@/components/ui/toast";

const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
type Status = (typeof STATUSES)[number];
type Priority = "low" | "medium" | "high" | "urgent";
type ViewMode = "summary" | "milestones" | "list" | "board";

const STATUS_LABELS: Record<Status, string> = {
  todo: "Por hacer", in_progress: "En progreso", in_review: "En revisión", done: "Completado",
};
const STATUS_COLORS: Record<Status, string> = {
  todo: "#7A8BAD", in_progress: "#3D7EFF", in_review: "#F59E0B", done: "#10D9A0",
};
const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#7A8BAD", medium: "#3D7EFF", high: "#F59E0B", urgent: "#F43F5E",
};
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente",
};

// VFP — la declaración "qué es estar terminado" del proyecto.
// Si está null/incompleta, el proyecto está en "modo planning" y se gatea la creación de tareas.
interface ProjectVFP {
  producto?: string;
  para?: string;
  quien?: string;
  aDiferenciaDe?: string;
  terminadoCuando?: string;
}
interface Project {
  id: string; name: string; description?: string;
  vfp?: ProjectVFP | null;
  ownerEmployeeId?: string | null;
  status?: string;
}
interface Task {
  id: string; projectId: string; organizationId?: string;
  title: string; description?: string; status: Status; priority?: Priority;
  assigneeName?: string;                  // legacy: nombre como string
  assigneeEmployeeId?: string | null;     // correlación con orgchart (preferido)
  milestoneId?: string | null;            // tarea scopeada a entregable
  dueDate?: string; orderIndex?: number;
  sectionName?: string; createdAt?: string;
}
interface Milestone {
  id: string; title: string; description?: string | null;
  status: "pending" | "in_progress" | "done"; dueDate?: string; orderIndex: number;
  acceptanceCriteria?: string | null;
  ownerEmployeeId?: string | null;
  bpmNodeId?: string | null;
}

// Info del proceso BPM del proyecto (si fue auto-creado por una instancia BPM)
interface BpmNodeInfo { id: string; label: string; type: string }
interface ProjectBpmContext {
  hasProcess: boolean;
  nodes: BpmNodeInfo[];
  processName?: string;
  currentNodeId?: string;
  status?: string;
}
interface Member {
  id: string; employeeId?: string; userId?: string; role: string;
  employee?: { fullName: string; jobTitle?: string; color?: string };
}
interface Employee { id: string; fullName: string; jobTitle?: string; color?: string }

// ─── Avatar (lookup by employee id preferido, fallback a nombre) ───────────────
// Buscar por id primero — sobrevive a renombres del empleado y es la correlación real.

function EmployeeAvatar({ name, employeeId, employees, size = 22 }: {
  name?: string | null; employeeId?: string | null; employees: Employee[]; size?: number;
}) {
  const emp = employeeId ? employees.find(e => e.id === employeeId) : (name ? employees.find(e => e.fullName === name) : null);
  const displayName = emp?.fullName ?? name ?? "";
  if (!displayName) return null;
  const color = emp?.color ?? "#7A8BAD";
  const initials = displayName.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div title={emp ? `${displayName}${emp.jobTitle ? " — " + emp.jobTitle : ""}` : displayName}
      style={{
        width: size, height: size, borderRadius: "50%", background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.42, fontWeight: 700, color: "#fff",
        flexShrink: 0, boxShadow: `0 0 0 1.5px ${color}33`,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Employee picker dropdown ──────────────────────────────────────────────────
// onChange recibe (name, id) — name para display legacy/fallback, id para correlación.
// onPick (opcional) recibe el employee completo si necesitás algo más rico.

function EmployeePicker({ value, employees, onChange, onClose, onPick }: {
  value: string | undefined; employees: Employee[];
  onChange: (name: string | undefined, employeeId: string | null) => void;
  onClose: () => void;
  onPick?: (emp: Employee | null) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = employees.filter(e => e.fullName.toLowerCase().includes(query.toLowerCase()));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
      background: "#0E1220", border: "1px solid #1E2540", borderRadius: 8,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", width: 240, maxHeight: 280,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar empleado..."
        style={{
          background: "#141928", border: "none", borderBottom: "1px solid #1E2540",
          padding: "8px 12px", fontSize: 12, color: "#E2E8F8", outline: "none",
        }}
      />
      <div style={{ overflowY: "auto", flex: 1 }}>
        {value && (
          <button onClick={() => { onChange(undefined, null); onPick?.(null); onClose(); }}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 12px", background: "transparent", border: "none",
              color: "#F43F5E", fontSize: 12, cursor: "pointer", textAlign: "left",
            }}
          >
            <X style={{ width: 12, height: 12 }} /> Quitar asignación
          </button>
        )}
        {filtered.length === 0 ? (
          <p style={{ padding: 14, color: "#7A8BAD", fontSize: 12, textAlign: "center", margin: 0 }}>
            Sin resultados
          </p>
        ) : filtered.map(emp => (
          <button key={emp.id} onClick={() => { onChange(emp.fullName, emp.id); onPick?.(emp); onClose(); }}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "6px 12px", background: value === emp.fullName ? "rgba(61,126,255,0.1)" : "transparent",
              border: "none", cursor: "pointer", textAlign: "left",
              borderLeft: value === emp.fullName ? "2px solid #3D7EFF" : "2px solid transparent",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#1E2540"; }}
            onMouseLeave={e => { e.currentTarget.style.background = value === emp.fullName ? "rgba(61,126,255,0.1)" : "transparent"; }}
          >
            <EmployeeAvatar name={emp.fullName} employees={employees} size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.fullName}</p>
              {emp.jobTitle && <p style={{ margin: 0, fontSize: 10, color: "#7A8BAD", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.jobTitle}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Milestone picker dropdown ─────────────────────────────────────────────────
// Lista los hitos del proyecto y permite asignar/desasignar la tarea a uno.

function MilestonePicker({ value, milestones, onChange, onClose }: {
  value: string | null | undefined; milestones: Milestone[];
  onChange: (id: string | null) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
      background: "#0E1220", border: "1px solid #1E2540", borderRadius: 8,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", width: 240, maxHeight: 300,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <button onClick={() => { onChange(null); onClose(); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
          background: "transparent", border: "none", borderBottom: "1px solid #1E2540",
          color: value === null || value === undefined ? "#3D7EFF" : "#7A8BAD",
          fontSize: 12, cursor: "pointer", textAlign: "left",
        }}>
        <X style={{ width: 11, height: 11 }} /> Sin hito (backlog)
      </button>
      {milestones.length === 0 ? (
        <p style={{ padding: 14, color: "#7A8BAD", fontSize: 12, textAlign: "center", margin: 0 }}>
          No hay hitos. Creá uno en la vista <strong>Hitos</strong>.
        </p>
      ) : (
        <div style={{ overflowY: "auto", flex: 1 }}>
          {milestones.map(m => {
            const due = formatDueDate(m.dueDate);
            return (
              <button key={m.id} onClick={() => { onChange(m.id); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 12px", background: value === m.id ? "rgba(61,126,255,0.1)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                  borderLeft: value === m.id ? "2px solid #3D7EFF" : "2px solid transparent",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#1E2540"; }}
                onMouseLeave={e => { e.currentTarget.style.background = value === m.id ? "rgba(61,126,255,0.1)" : "transparent"; }}
              >
                <Flag style={{ width: 11, height: 11, color: MILESTONE_STATUS_COLORS[m.status], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</p>
                  {due && <p style={{ margin: 0, fontSize: 10, color: due.color, fontFamily: "monospace" }}>{due.label}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MILESTONE_STATUS_COLORS: Record<Milestone["status"], string> = {
  pending: "#7A8BAD", in_progress: "#3D7EFF", done: "#10D9A0",
};
const MILESTONE_STATUS_LABELS: Record<Milestone["status"], string> = {
  pending: "Pendiente", in_progress: "En progreso", done: "Completo",
};

// ─── Inline dropdown for status/priority ───────────────────────────────────────

function InlineEnumPicker<T extends string>({ value, options, labels, colors, onChange, onClose }: {
  value: T; options: readonly T[]; labels: Record<T, string>; colors: Record<T, string>;
  onChange: (v: T) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
      background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 140, overflow: "hidden",
    }}>
      {options.map(opt => (
        <button key={opt} onClick={() => { onChange(opt); onClose(); }}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "7px 12px",
            background: value === opt ? "rgba(61,126,255,0.1)" : "transparent",
            border: "none", cursor: "pointer", textAlign: "left",
            fontSize: 12, color: "#E2E8F8",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#1E2540"; }}
          onMouseLeave={e => { e.currentTarget.style.background = value === opt ? "rgba(61,126,255,0.1)" : "transparent"; }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[opt], flexShrink: 0 }} />
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

// ─── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ filterStatus, setFilterStatus, filterPriority, setFilterPriority, filterAssignee, setFilterAssignee, employees, totalTasks, filteredCount }: {
  filterStatus: Set<Status>; setFilterStatus: (s: Set<Status>) => void;
  filterPriority: Set<Priority>; setFilterPriority: (s: Set<Priority>) => void;
  filterAssignee: string | null; setFilterAssignee: (a: string | null) => void;
  employees: Employee[]; totalTasks: number; filteredCount: number;
}) {
  const [showAssignee, setShowAssignee] = useState(false);
  const toggle = <T,>(set: Set<T>, item: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set); next.has(item) ? next.delete(item) : next.add(item); setter(next);
  };
  const hasFilters = filterStatus.size > 0 || filterPriority.size > 0 || filterAssignee;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", borderBottom: "1px solid #1E2540", background: "#0A0E1A", flexWrap: "wrap" }}>
      <Filter size={12} style={{ color: "#7A8BAD" }} />
      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase" }}>Filtros</span>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 4 }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => toggle(filterStatus, s, setFilterStatus)}
            style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 4,
              background: filterStatus.has(s) ? `${STATUS_COLORS[s]}22` : "transparent",
              border: `1px solid ${filterStatus.has(s) ? STATUS_COLORS[s] + "66" : "#1E2540"}`,
              color: filterStatus.has(s) ? STATUS_COLORS[s] : "#7A8BAD",
              cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
            }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 16, background: "#1E2540" }} />

      {/* Priority filter */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["low","medium","high","urgent"] as Priority[]).map(p => (
          <button key={p} onClick={() => toggle(filterPriority, p, setFilterPriority)}
            style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 4,
              background: filterPriority.has(p) ? `${PRIORITY_COLORS[p]}22` : "transparent",
              border: `1px solid ${filterPriority.has(p) ? PRIORITY_COLORS[p] + "66" : "#1E2540"}`,
              color: filterPriority.has(p) ? PRIORITY_COLORS[p] : "#7A8BAD",
              cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
            }}>
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 16, background: "#1E2540" }} />

      {/* Assignee filter */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setShowAssignee(prev => !prev)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 10, padding: "3px 8px", borderRadius: 4,
            background: filterAssignee ? "rgba(61,126,255,0.15)" : "transparent",
            border: `1px solid ${filterAssignee ? "#3D7EFF66" : "#1E2540"}`,
            color: filterAssignee ? "#3D7EFF" : "#7A8BAD",
            cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
          }}>
          <User size={10} />
          {filterAssignee ?? "Responsable"}
        </button>
        {showAssignee && (
          <EmployeePicker value={filterAssignee ?? undefined} employees={employees}
            onChange={n => setFilterAssignee(n ?? null)} onClose={() => setShowAssignee(false)} />
        )}
      </div>

      {hasFilters && (
        <button onClick={() => { setFilterStatus(new Set()); setFilterPriority(new Set()); setFilterAssignee(null); }}
          style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 4,
            background: "transparent", border: "1px solid #F43F5E55", color: "#F43F5E",
            cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
          }}>
          Limpiar
        </button>
      )}

      <span style={{ marginLeft: "auto", fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
        {hasFilters ? `${filteredCount}/${totalTasks} tareas` : `${totalTasks} tarea${totalTasks !== 1 ? "s" : ""}`}
      </span>
    </div>
  );
}

function formatDueDate(dateStr: string | undefined): { label: string; color: string } | null {
  if (!dateStr) return null;
  const due = new Date(dateStr); const now = new Date(); now.setHours(0,0,0,0); due.setHours(0,0,0,0);
  const diffDays = (due.getTime() - now.getTime()) / 86400000;
  const label = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
  return { label, color: diffDays < 0 ? "#F43F5E" : diffDays <= 3 ? "#F59E0B" : "#7A8BAD" };
}

// ─── Project Detail Modal ──────────────────────────────────────────────────────

function ProjectDetailModal({ project, onClose, onUpdated }: {
  project: Project; onClose: () => void; onUpdated: (p: Project) => void;
}) {
  const [tab, setTab] = useState<"milestones" | "members">("milestones");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMilestone, setNewMilestone] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [editingName, setEditingName] = useState(project.name);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${project.id}/milestones`).then(r => r.ok ? r.json() : []),
      fetch(`/api/projects/${project.id}/members`).then(r => r.ok ? r.json() : []),
      fetch("/api/employees").then(r => r.ok ? r.json() : []),
    ]).then(([m, mb, e]) => {
      setMilestones(Array.isArray(m) ? m : []);
      setMembers(Array.isArray(mb) ? mb : []);
      setEmployees(Array.isArray(e) ? e : []);
    }).finally(() => setLoading(false));
  }, [project.id]);

  const saveName = async () => {
    if (editingName.trim() === project.name) return;
    setSavingName(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName.trim() }),
    });
    if (res.ok) { const updated = await res.json(); onUpdated(updated); }
    setSavingName(false);
  };

  const addMilestone = async () => {
    if (!newMilestone.trim()) return;
    const res = await fetch(`/api/projects/${project.id}/milestones`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newMilestone.trim() }),
    });
    if (res.ok) { const m = await res.json(); setMilestones(prev => [...prev, m]); setNewMilestone(""); }
  };

  const cycleMilestone = async (m: Milestone) => {
    const next = m.status === "pending" ? "in_progress" : m.status === "in_progress" ? "done" : "pending";
    await fetch(`/api/projects/${project.id}/milestones/${m.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, status: next } : x));
  };

  const deleteMilestone = async (id: string) => {
    await fetch(`/api/projects/${project.id}/milestones/${id}`, { method: "DELETE" });
    setMilestones(prev => prev.filter(m => m.id !== id));
  };

  const addMember = async () => {
    if (!selectedEmpId) return;
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: selectedEmpId }),
    });
    if (res.ok) {
      const emp = employees.find(e => e.id === selectedEmpId);
      const m = await res.json();
      setMembers(prev => [...prev, { ...m, employee: emp }]);
      setSelectedEmpId(""); setAddingMember(false);
    }
  };

  const removeMember = async (memberId: string) => {
    await fetch(`/api/projects/${project.id}/members?memberId=${memberId}`, { method: "DELETE" });
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const msIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="h-4 w-4" style={{ color: "#10D9A0" }} />;
    if (status === "in_progress") return <Clock className="h-4 w-4" style={{ color: "#3D7EFF" }} />;
    return <Circle className="h-4 w-4" style={{ color: "#7A8BAD" }} />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col rounded-xl w-full" style={{ maxWidth: 600, maxHeight: "88vh", background: "#0E1220", border: "1px solid #1E2540" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#1E2540" }}>
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
            <input
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => e.key === "Enter" && saveName()}
              className="text-base font-semibold bg-transparent border-none outline-none flex-1 min-w-0"
              style={{ color: "#E2E8F8" }}
            />
            {savingName && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" style={{ color: "#3D7EFF" }} />}
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-[#1E2540] shrink-0" style={{ color: "#7A8BAD" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6" style={{ borderColor: "#1E2540" }}>
          {(["milestones", "members"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="py-3 px-4 text-sm font-medium capitalize"
              style={{ borderBottom: tab === t ? "2px solid #3D7EFF" : "2px solid transparent", color: tab === t ? "#3D7EFF" : "#7A8BAD" }}>
              {t === "milestones" ? "Hitos" : "Miembros"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#3D7EFF" }} />
            </div>
          ) : tab === "milestones" ? (
            <div className="flex flex-col gap-2">
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ background: "#141928", border: "1px solid #1E2540" }}>
                  <button onClick={() => cycleMilestone(m)} className="shrink-0">{msIcon(m.status)}</button>
                  <span className="flex-1 text-sm" style={{ color: m.status === "done" ? "#7A8BAD" : "#E2E8F8", textDecoration: m.status === "done" ? "line-through" : "none" }}>
                    {m.title}
                  </span>
                  {m.dueDate && (
                    <span className="text-xs font-mono shrink-0" style={{ color: "#7A8BAD" }}>
                      {new Date(m.dueDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </span>
                  )}
                  <button onClick={() => deleteMilestone(m.id)} className="shrink-0 rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {milestones.length === 0 && (
                <div className="py-8 text-center text-sm rounded-lg" style={{ color: "#7A8BAD", border: "1px dashed #1E2540" }}>
                  Sin hitos todavía
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <input value={newMilestone} onChange={e => setNewMilestone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addMilestone()}
                  placeholder="Nuevo hito…"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }} />
                <button onClick={addMilestone}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
                  style={{ background: "#3D7EFF", color: "#fff" }}>
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {members.map(m => {
                const name = m.employee?.fullName ?? m.userId?.slice(0, 10) ?? "Usuario";
                const color = m.employee?.color ?? "#3D7EFF";
                const initials = name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                    style={{ background: "#141928", border: "1px solid #1E2540" }}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shrink-0"
                      style={{ background: color + "33", border: `2px solid ${color}`, color }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#E2E8F8" }}>{name}</p>
                      {m.employee?.jobTitle && <p className="text-xs truncate" style={{ color: "#7A8BAD" }}>{m.employee.jobTitle}</p>}
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded shrink-0"
                      style={{ background: "rgba(61,126,255,0.12)", color: "#3D7EFF" }}>{m.role}</span>
                    <button onClick={() => removeMember(m.id)} className="rounded p-1 hover:bg-[#1E2540] shrink-0" style={{ color: "#7A8BAD" }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {members.length === 0 && (
                <div className="py-8 text-center text-sm rounded-lg" style={{ color: "#7A8BAD", border: "1px dashed #1E2540" }}>
                  Sin miembros asignados
                </div>
              )}
              {addingMember ? (
                <div className="flex gap-2 mt-2">
                  <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}>
                    <option value="">— Seleccionar empleado —</option>
                    {employees.filter(e => !members.some(m => m.employeeId === e.id)).map(e => (
                      <option key={e.id} value={e.id}>{e.fullName}{e.jobTitle ? ` · ${e.jobTitle}` : ""}</option>
                    ))}
                  </select>
                  <button onClick={addMember} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "#3D7EFF", color: "#fff" }}>
                    Agregar
                  </button>
                  <button onClick={() => { setAddingMember(false); setSelectedEmpId(""); }}
                    className="rounded-lg p-2 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setAddingMember(true)}
                  className="flex items-center gap-1.5 mt-2 rounded-lg px-3 py-2 text-sm"
                  style={{ background: "transparent", border: "1px dashed #1E2540", color: "#7A8BAD" }}>
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Agregar miembro
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [addingProject, setAddingProject] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [showDetail, setShowDetail] = useState(false);

  // List view state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [addingTaskSection, setAddingTaskSection] = useState<string | null>(null);
  const [inlineTaskTitle, setInlineTaskTitle] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task>>({});
  const [localSections, setLocalSections] = useState<string[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // Employees (for assignee picker + avatar)
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Milestones del proyecto seleccionado — cargadas para el picker de tareas y la vista Hitos.
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // Filters (compartidos entre board y list)
  const [filterStatus, setFilterStatus] = useState<Set<Status>>(new Set());
  const [filterPriority, setFilterPriority] = useState<Set<Priority>>(new Set());
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState<string>("");

  // Bulk select (list view)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    fetch("/api/employees").then(r => r.ok ? r.json() : []).then(data => {
      setEmployees(Array.isArray(data) ? data : []);
    }).catch(() => setEmployees([]));
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const list: Project[] = Array.isArray(data) ? data : [];
      setProjects(list);
      // No auto-select — start at hub view by default
    } catch { setProjects([]); }
    finally { setIsLoading(false); }
  };

  const fetchTasks = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/tasks?projectId=${selectedProject}`);
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); }
  }, [selectedProject]);

  const fetchMilestones = useCallback(async () => {
    if (!selectedProject) { setMilestones([]); return; }
    try {
      const res = await fetch(`/api/projects/${selectedProject}/milestones`);
      const data = await res.json();
      setMilestones(Array.isArray(data) ? data : []);
    } catch { setMilestones([]); }
  }, [selectedProject]);

  useEffect(() => { fetchTasks(); fetchMilestones(); }, [fetchTasks, fetchMilestones]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName }),
      });
      const proj = await res.json();
      if (proj?.id) {
        setProjects(prev => [...prev, proj]);
        setSelectedProject(proj.id);
        setNewProjectName(""); setAddingProject(false);
      }
    } catch { /* ignore */ }
  };

  const createTask = async (status: Status = "todo", sectionName?: string, titleOverride?: string) => {
    const title = titleOverride !== undefined ? titleOverride : (sectionName !== undefined ? inlineTaskTitle : newTaskTitle);
    if (!title.trim() || !selectedProject) return;
    const body: Record<string, string> = { projectId: selectedProject, title: title.trim(), status };
    if (sectionName !== undefined) body.sectionName = sectionName;
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const task = await res.json();
    if (task?.id) {
      setTasks(prev => [...prev, task]);
      if (titleOverride === undefined) {
        if (sectionName !== undefined) { setInlineTaskTitle(""); setAddingTaskSection(null); }
        else setNewTaskTitle("");
      }
    }
  };

  // Crear tarea ya asignada a un hito (atajo desde MilestoneCard)
  const createTaskInMilestone = async (milestoneId: string, title: string) => {
    if (!title.trim() || !selectedProject) return;
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProject, title: title.trim(), status: "todo", milestoneId }),
    });
    if (res.ok) {
      const task = await res.json();
      if (task?.id) setTasks(prev => [...prev, task]);
    }
  };

  // Crear tarea con opciones completas (para Tablero quick add: respeta dueDate del bucket)
  const createTaskFull = async (opts: { title: string; status?: Status; dueDate?: string; milestoneId?: string }) => {
    if (!opts.title.trim() || !selectedProject) return;
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: selectedProject,
        title: opts.title.trim(),
        status: opts.status ?? "todo",
        dueDate: opts.dueDate,
        milestoneId: opts.milestoneId,
      }),
    });
    if (res.ok) {
      const task = await res.json();
      if (task?.id) setTasks(prev => [...prev, task]);
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    await fetch(`/api/tasks/${taskId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    if (detailTask?.id === taskId) setDetailTask(prev => prev ? { ...prev, ...updates } : prev);
  };

  const deleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (detailTask?.id === taskId) setDetailTask(null);
  };

  // Aplica filtros activos a una lista de tareas. Filtros vacíos = todo pasa.
  const applyFilters = useCallback((arr: Task[]) => {
    const q = taskSearch.trim().toLowerCase();
    return arr.filter(t => {
      if (filterStatus.size > 0 && !filterStatus.has(t.status)) return false;
      if (filterPriority.size > 0 && (!t.priority || !filterPriority.has(t.priority))) return false;
      if (filterAssignee && t.assigneeName !== filterAssignee) return false;
      if (q) {
        const inTitle = t.title.toLowerCase().includes(q);
        const inDesc = (t.description ?? "").toLowerCase().includes(q);
        if (!inTitle && !inDesc) return false;
      }
      return true;
    });
  }, [filterStatus, filterPriority, filterAssignee, taskSearch]);

  const visibleTasks = useMemo(() => applyFilters(tasks), [tasks, applyFilters]);
  const getTasksByStatus = (status: Status) => visibleTasks.filter(t => t.status === status);

  // Bulk operations sobre las tareas seleccionadas
  const bulkUpdate = async (updates: Partial<Task>) => {
    await Promise.all(Array.from(selectedIds).map(id =>
      fetch(`/api/tasks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) })
    ));
    setTasks(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, ...updates } : t));
    setSelectedIds(new Set());
  };
  const bulkDelete = async () => {
    await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/tasks/${id}`, { method: "DELETE" })));
    setTasks(prev => prev.filter(t => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
  };

  // Sections legacy — texto libre. Persisten por compatibilidad con tareas viejas.
  // Las tareas nuevas se asignan a hitos (milestoneId), no a secciones de string.
  // Si no hay secciones custom Y hay tareas sin sección, mostramos un único bucket
  // "Todas las tareas" en vez del fantasma "Sin sección".
  const getSections = (): string[] => {
    const sectionSet = new Set<string>();
    let hasUngrouped = false;
    tasks.forEach(t => {
      if (t.sectionName && t.sectionName !== "Sin sección") sectionSet.add(t.sectionName);
      else hasUngrouped = true;
    });
    const result = Array.from(sectionSet);
    // Solo incluimos "Sin sección" cuando hay otras secciones (es residual).
    if (hasUngrouped && result.length > 0) result.unshift("Sin sección");
    // Caso "no hay secciones": damos un bucket vacío para que el render no falle
    // pero mostramos "Todas las tareas" como label visual (manejado en render).
    if (result.length === 0) result.push("Sin sección");
    return result;
  };

  // Filtered: usado por el FilterBar y bulkActions
  const totalTasksCount = tasks.length;
  const filteredCount = visibleTasks.length;

  const getTasksBySection = (section: string) =>
    visibleTasks.filter(t => section === "Sin sección" ? !t.sectionName || t.sectionName === "Sin sección" : t.sectionName === section);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => { const next = new Set(prev); next.has(section) ? next.delete(section) : next.add(section); return next; });
  };

  const openDetail = (task: Task) => { setDetailTask(task); setEditingTask({ ...task }); };
  const saveDetail = async () => { if (!detailTask) return; await updateTask(detailTask.id, editingTask); setDetailTask(null); };

  const addSection = async () => {
    if (!newSectionName.trim()) return;
    setLocalSections(prev => [...prev, newSectionName]);
    setAddingSection(false); setNewSectionName("");
  };

  const allSections = (): string[] => {
    const fromTasks = getSections();
    return [...fromTasks, ...localSections.filter(s => !fromTasks.includes(s))];
  };

  useEffect(() => {
    if (addingTaskSection !== null && inlineInputRef.current) inlineInputRef.current.focus();
  }, [addingTaskSection]);

  const selectedProjectObj = projects.find(p => p.id === selectedProject);

  if (isLoading) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "#080B12" }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#3D7EFF" }} />
      </div>
    );
  }

  // Project no longer exists — return to hub (defer setState to avoid render error)
  if (selectedProject && !selectedProjectObj) {
    setTimeout(() => setSelectedProject(null), 0);
  }

  const onProjectUpdate = (updates: Partial<Project>) => {
    if (!selectedProjectObj) return;
    fetch(`/api/projects/${selectedProjectObj.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).then(r => r.ok ? r.json() : null).then(updated => {
      if (updated) setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    });
  };

  return (
    <>
      {/* Hub siempre detrás. El modal flota encima cuando hay proyecto seleccionado. */}
      <ProjectsHub
        projects={projects}
        addingProject={addingProject}
        setAddingProject={setAddingProject}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        createProject={createProject}
        onSelect={setSelectedProject}
        onProjectInstantiated={(p) => {
          setProjects(prev => [...prev, p]);
          setSelectedProject(p.id);
        }}
      />

      {/* Modal flotante con todo: VFP + stats + hitos + tareas en un solo scroll */}
      {selectedProjectObj && (
        <ProjectModal
          project={selectedProjectObj}
          tasks={tasks}
          visibleTasks={visibleTasks}
          milestones={milestones}
          employees={employees}
          onClose={() => { setSelectedProject(null); setSelectedIds(new Set()); }}
          onProjectUpdate={onProjectUpdate}
          /* Tasks state passthrough */
          newTaskTitle={newTaskTitle} setNewTaskTitle={setNewTaskTitle}
          createTask={createTask} updateTask={updateTask} deleteTask={deleteTask}
          openDetail={openDetail} detailTask={detailTask} setDetailTask={setDetailTask}
          editingTask={editingTask} setEditingTask={setEditingTask} saveDetail={saveDetail}
          getTasksByStatus={getTasksByStatus} getTasksBySection={getTasksBySection}
          allSections={allSections()}
          collapsedSections={collapsedSections} toggleSection={toggleSection}
          expandedTask={expandedTask} setExpandedTask={setExpandedTask}
          addingTaskSection={addingTaskSection} setAddingTaskSection={setAddingTaskSection}
          inlineTaskTitle={inlineTaskTitle} setInlineTaskTitle={setInlineTaskTitle}
          inlineInputRef={inlineInputRef}
          addingSection={addingSection} setAddingSection={setAddingSection}
          newSectionName={newSectionName} setNewSectionName={setNewSectionName}
          addSection={addSection}
          /* Filters */
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterPriority={filterPriority} setFilterPriority={setFilterPriority}
          filterAssignee={filterAssignee} setFilterAssignee={setFilterAssignee}
          taskSearch={taskSearch} setTaskSearch={setTaskSearch}
          totalTasks={totalTasksCount} filteredCount={filteredCount}
          /* Bulk */
          selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          bulkUpdate={bulkUpdate} bulkDelete={bulkDelete}
          /* Milestones */
          fetchMilestones={fetchMilestones}
          createTaskInMilestone={createTaskInMilestone}
          createTaskFull={createTaskFull}
        />
      )}

      {/* Detail modal (legacy "Hitos y equipo") — solo se abre on-demand */}
      {showDetail && selectedProjectObj && (
        <ProjectDetailModal
          project={selectedProjectObj}
          onClose={() => setShowDetail(false)}
          onUpdated={updated => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))}
        />
      )}
    </>
  );
}

/* ─── Projects Hub ─── */
function ProjectsHub({
  projects, addingProject, setAddingProject,
  newProjectName, setNewProjectName, createProject, onSelect,
  onProjectInstantiated,
}: {
  projects: Project[];
  addingProject: boolean;
  setAddingProject: (v: boolean) => void;
  newProjectName: string;
  setNewProjectName: (v: string) => void;
  createProject: () => void;
  onSelect: (id: string) => void;
  onProjectInstantiated: (p: Project) => void;
}) {
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<Record<string, { tasks: number; done: number; members: number }>>({});
  const [showTemplates, setShowTemplates] = useState(false);

  // Fetch lightweight stats per project — paralelo, no secuencial.
  // Antes: for() con await por cada proyecto → con N proyectos eran 2N requests en serie.
  // Ahora: Promise.all() lanza todos al mismo tiempo → 2 trips de RTT en total.
  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    (async () => {
      const result: Record<string, { tasks: number; done: number; members: number }> = {};
      const pairs = await Promise.all(projects.map(async p => {
        try {
          const [tRes, mRes] = await Promise.all([
            fetch(`/api/tasks?projectId=${p.id}`),
            fetch(`/api/projects/${p.id}/members`),
          ]);
          const tasks = tRes.ok ? await tRes.json() : [];
          const members = mRes.ok ? await mRes.json() : [];
          return [p.id, {
            tasks: Array.isArray(tasks) ? tasks.length : 0,
            done: Array.isArray(tasks) ? tasks.filter((t: { status: string }) => t.status === "done").length : 0,
            members: Array.isArray(members) ? members.length : 0,
          }] as const;
        } catch {
          return [p.id, { tasks: 0, done: 0, members: 0 }] as const;
        }
      }));
      if (cancelled) return;
      for (const [id, stats] of pairs) result[id] = stats;
      setStats(result);
    })();
    return () => { cancelled = true; };
  }, [projects]);

  // Filtro de estado: activos por default, archivados = completado/cancelado, todos = sin filtro
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const isArchived = (p: Project) => p.status === "completado" || p.status === "cancelado";
  const filtered = projects
    .filter(p => {
      if (statusFilter === "active" && isArchived(p)) return false;
      if (statusFilter === "archived" && !isArchived(p)) return false;
      return true;
    })
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase())
    );
  const counts = {
    active: projects.filter(p => !isArchived(p)).length,
    archived: projects.filter(p => isArchived(p)).length,
    all: projects.length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080B12", overflow: "auto" }}>
      {/* Header */}
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #1E2540" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, gap: 16 }}>
          <div>
            <p style={{ fontSize: 10, color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px", fontFamily: "monospace" }}>
              Workspace
            </p>
            <h1 style={{ color: "#E2E8F8", fontSize: 22, fontWeight: 700, margin: 0 }}>Proyectos</h1>
            <p style={{ color: "#7A8BAD", fontSize: 13, margin: "4px 0 0" }}>
              {projects.length} proyecto{projects.length !== 1 ? "s" : ""} en tu organización
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowTemplates(true)} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(168,85,247,0.12)", color: "#A855F7",
              border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: 6, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              <Folder style={{ width: 14, height: 14 }} strokeWidth={2} />
              Desde template
            </button>
            <button onClick={() => setAddingProject(true)} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#3D7EFF", color: "#fff", border: "none",
              borderRadius: 6, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 0 16px rgba(61,126,255,0.35)",
            }}>
              <Plus style={{ width: 14, height: 14 }} strokeWidth={2.5} />
              Nuevo proyecto
            </button>
          </div>
        </div>
        {/* Search + filter chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", maxWidth: 420, flex: "1 1 240px" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#7A8BAD" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proyecto..."
              style={{
                width: "100%", background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6,
                padding: "8px 12px 8px 36px", fontSize: 13, color: "#E2E8F8", outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6, overflow: "hidden" }}>
            {([
              { v: "active" as const, label: "Activos" },
              { v: "archived" as const, label: "Archivados" },
              { v: "all" as const, label: "Todos" },
            ]).map(({ v, label }) => (
              <button key={v} onClick={() => setStatusFilter(v)} style={{
                padding: "6px 12px", fontSize: 11, border: "none", cursor: "pointer",
                background: statusFilter === v ? "#1E2540" : "transparent",
                color: statusFilter === v ? "#E2E8F8" : "#7A8BAD",
                fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {label}
                <span style={{ fontSize: 9, opacity: 0.7 }}>{counts[v]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* New project inline form */}
      {addingProject && (
        <div style={{ padding: "16px 32px", borderBottom: "1px solid #1E2540", background: "rgba(61,126,255,0.04)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createProject(); if (e.key === "Escape") { setAddingProject(false); setNewProjectName(""); } }}
              placeholder="Nombre del proyecto..."
              style={{
                flex: 1, background: "#141928", border: "1px solid #3D7EFF", borderRadius: 6,
                padding: "8px 12px", fontSize: 13, color: "#E2E8F8", outline: "none",
              }}
            />
            <button onClick={createProject} style={{
              background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6,
              padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Crear
            </button>
            <button onClick={() => { setAddingProject(false); setNewProjectName(""); }} style={{
              background: "transparent", color: "#7A8BAD", border: "1px solid #1E2540",
              borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer",
            }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Project grid */}
      <div style={{ padding: "28px 32px", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "60px 24px", textAlign: "center",
            border: "1px dashed #1E2540", borderRadius: 12, background: "#0E1220",
          }}>
            <Folder style={{ width: 36, height: 36, margin: "0 auto 10px", color: "#1E2540" }} strokeWidth={1.5} />
            <p style={{ color: "#E2E8F8", fontSize: 14, fontWeight: 600, margin: 0 }}>
              {search ? "Sin resultados" : "Todavía no hay proyectos"}
            </p>
            <p style={{ color: "#7A8BAD", fontSize: 12, margin: "6px 0 0" }}>
              {search ? "Probá con otro término de búsqueda" : "Creá el primero para empezar a organizar tu trabajo"}
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {filtered.map(p => {
              const s = stats[p.id] ?? { tasks: 0, done: 0, members: 0 };
              const pct = s.tasks > 0 ? Math.round((s.done / s.tasks) * 100) : 0;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  style={{
                    display: "flex", flexDirection: "column", gap: 14,
                    padding: 18, background: "#0E1220", border: "1px solid #1E2540",
                    borderRadius: 10, cursor: "pointer", textAlign: "left",
                    transition: "transform 0.12s, border-color 0.12s, box-shadow 0.12s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = "#3D7EFF";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 28px rgba(61,126,255,0.18)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "#1E2540";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: "rgba(61,126,255,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Folder style={{ width: 18, height: 18, color: "#3D7EFF" }} strokeWidth={1.75} />
                    </div>
                    <p style={{
                      flex: 1, fontSize: 14, fontWeight: 600, color: "#E2E8F8", margin: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {p.name}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7A8BAD", marginBottom: 6 }}>
                      <span style={{ fontFamily: "monospace" }}>{s.done}/{s.tasks} tareas</span>
                      <span style={{ fontFamily: "monospace", color: pct === 100 ? "#10D9A0" : "#3D7EFF" }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: "#1E2540", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: pct === 100 ? "#10D9A0" : "#3D7EFF",
                        borderRadius: 4, transition: "width 0.3s",
                      }} />
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#7A8BAD" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <UsersIcon style={{ width: 12, height: 12 }} />
                      {s.members} miembro{s.members !== 1 ? "s" : ""}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <TrendingUp style={{ width: 12, height: 12 }} />
                      {s.tasks - s.done} pendiente{s.tasks - s.done !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de templates */}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onInstantiated={(p) => { onProjectInstantiated(p); setShowTemplates(false); }}
        />
      )}
    </div>
  );
}

/* ─── Templates modal — listar y crear proyecto desde template ─── */
interface ProjectTemplate {
  id: string; name: string; description: string | null;
  structure: { vfp?: Record<string, string> | null; milestones?: Array<{ title: string; tasks?: unknown[] }>; standaloneTasks?: unknown[] };
  processDefinitionId: string | null;
  createdAt: string;
}

function TemplatesModal({ onClose, onInstantiated }: {
  onClose: () => void; onInstantiated: (p: Project) => void;
}) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [instantiating, setInstantiating] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/project-templates").then(r => r.ok ? r.json() : [])
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const instantiate = async (templateId: string) => {
    setInstantiating(templateId);
    try {
      const res = await fetch(`/api/project-templates/${templateId}/instantiate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const proj = await res.json();
        onInstantiated(proj);
      }
    } finally { setInstantiating(null); }
  };

  const deleteTemplate = async (templateId: string) => {
    const res = await fetch(`/api/project-templates/${templateId}`, { method: "DELETE" });
    if (res.ok) setTemplates(prev => prev.filter(t => t.id !== templateId));
    setConfirmDelete(null);
  };

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{
        width: "min(720px, 100%)", maxHeight: "90vh",
        background: "#0E1220", border: "1px solid #1E2540", borderRadius: 12,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #1E2540", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#A855F7", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Templates
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, color: "#E2E8F8" }}>
              Crear proyecto desde un template
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#7A8BAD" }}>
              Cloná estructuras reutilizables — VFP, hitos y tareas ya armados.
            </p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
              <Loader2 className="animate-spin" style={{ color: "#A855F7", width: 22, height: 22 }} />
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", border: "1px dashed #1E2540", borderRadius: 10, background: "#0A0E1A" }}>
              <Folder style={{ width: 36, height: 36, margin: "0 auto 10px", color: "#1E2540" }} strokeWidth={1.5} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#E2E8F8" }}>Sin templates todavía</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7A8BAD" }}>
                Creá uno desde el menú de un proyecto existente: <strong>&quot;Guardar como template&quot;</strong>.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {templates.map(t => {
                const milestoneCount = t.structure.milestones?.length ?? 0;
                const taskCount = (t.structure.milestones ?? []).reduce((acc, m) => acc + (m.tasks?.length ?? 0), 0)
                                + (t.structure.standaloneTasks?.length ?? 0);
                return (
                  <div key={t.id} style={{
                    padding: "12px 14px", background: "#141928", border: "1px solid #1E2540", borderRadius: 8,
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: "rgba(168,85,247,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Folder style={{ width: 18, height: 18, color: "#A855F7" }} strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </p>
                      {t.description && (
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7A8BAD", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</p>
                      )}
                      <div style={{ marginTop: 4, display: "flex", gap: 10, fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
                        <span><Flag style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} /> {milestoneCount} hitos</span>
                        <span><CheckCircle2 style={{ width: 9, height: 9, display: "inline", marginRight: 2 }} /> {taskCount} tareas</span>
                        {t.structure.vfp && Object.keys(t.structure.vfp).length > 0 && <span style={{ color: "#3D7EFF" }}>★ VFP</span>}
                      </div>
                    </div>
                    {confirmDelete === t.id ? (
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => deleteTemplate(t.id)} style={{
                          background: "#F43F5E", color: "#fff", border: "none", borderRadius: 5,
                          padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}>Confirmar</button>
                        <button onClick={() => setConfirmDelete(null)} style={{
                          background: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 5,
                          padding: "5px 10px", fontSize: 11, cursor: "pointer",
                        }}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => instantiate(t.id)} disabled={!!instantiating}
                          style={{
                            background: "#A855F7", color: "#fff", border: "none", borderRadius: 5,
                            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 5,
                            opacity: instantiating === t.id ? 0.6 : 1,
                          }}>
                          {instantiating === t.id
                            ? <Loader2 className="animate-spin" style={{ width: 11, height: 11 }} />
                            : <Plus style={{ width: 11, height: 11 }} strokeWidth={2.5} />}
                          Usar
                        </button>
                        <button onClick={() => setConfirmDelete(t.id)} title="Eliminar template"
                          style={{ background: "transparent", color: "#F43F5E", border: "1px solid #F43F5E33", borderRadius: 5, padding: "5px 8px", cursor: "pointer" }}>
                          <Trash2 style={{ width: 11, height: 11 }} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Bulk action bar ─── */
function BulkActionBar({ count, employees, onStatusChange, onPriorityChange, onAssigneeChange, onDelete, onClear }: {
  count: number; employees: Employee[];
  onStatusChange: (s: Status) => void; onPriorityChange: (p: Priority) => void;
  onAssigneeChange: (n: string | undefined, id: string | null) => void; onDelete: () => void; onClear: () => void;
}) {
  const [showStatus, setShowStatus] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [showAssignee, setShowAssignee] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", background: "rgba(61,126,255,0.08)", borderBottom: "1px solid rgba(61,126,255,0.3)" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#3D7EFF" }}>
        {count} tarea{count !== 1 ? "s" : ""} seleccionada{count !== 1 ? "s" : ""}
      </span>
      <div style={{ position: "relative" }}>
        <button onClick={() => setShowStatus(p => !p)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, background: "#141928", border: "1px solid #1E2540", color: "#C4CFEA", cursor: "pointer" }}>
          Cambiar estado
        </button>
        {showStatus && <InlineEnumPicker value={"todo" as Status} options={STATUSES} labels={STATUS_LABELS} colors={STATUS_COLORS}
          onChange={s => onStatusChange(s)} onClose={() => setShowStatus(false)} />}
      </div>
      <div style={{ position: "relative" }}>
        <button onClick={() => setShowPriority(p => !p)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, background: "#141928", border: "1px solid #1E2540", color: "#C4CFEA", cursor: "pointer" }}>
          Cambiar prioridad
        </button>
        {showPriority && <InlineEnumPicker value={"medium" as Priority} options={["low","medium","high","urgent"] as const} labels={PRIORITY_LABELS} colors={PRIORITY_COLORS}
          onChange={p => onPriorityChange(p)} onClose={() => setShowPriority(false)} />}
      </div>
      <div style={{ position: "relative" }}>
        <button onClick={() => setShowAssignee(p => !p)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, background: "#141928", border: "1px solid #1E2540", color: "#C4CFEA", cursor: "pointer" }}>
          Asignar
        </button>
        {showAssignee && <EmployeePicker value={undefined} employees={employees}
          onChange={(n, id) => onAssigneeChange(n, id)} onClose={() => setShowAssignee(false)} />}
      </div>
      <button onClick={onDelete} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, background: "transparent", border: "1px solid #F43F5E55", color: "#F43F5E", cursor: "pointer" }}>
        <Trash2 style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
        Eliminar
      </button>
      <button onClick={onClear} style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 4, background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer" }}>
        Cancelar
      </button>
    </div>
  );
}

/* ─── Summary view — la portada del proyecto ─── */
function SummaryView({ project, employees, tasks, onProjectUpdate, onJumpToWork }: {
  project: Project; employees: Employee[]; tasks: Task[];
  onProjectUpdate: (u: Partial<Project>) => void;
  onJumpToWork: () => void;
}) {
  const [editingVFP, setEditingVFP] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);

  const vfp = project.vfp ?? null;
  const vfpComplete = vfp && vfp.producto && vfp.para && vfp.quien && vfp.terminadoCuando;
  const owner = employees.find(e => e.id === project.ownerEmployeeId);

  // Project health
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const health = overdue > 0 ? "atrasado" : pct === 100 ? "completo" : pct >= 50 ? "bien" : total === 0 ? "vacio" : "iniciando";
  const healthColor = { atrasado: "#F43F5E", completo: "#10D9A0", bien: "#10D9A0", iniciando: "#3D7EFF", vacio: "#7A8BAD" }[health];
  const healthLabel = { atrasado: "Atrasado", completo: "Completo", bien: "En buen ritmo", iniciando: "Iniciando", vacio: "Sin trabajo" }[health];

  // Próximas tareas (no completadas, ordenadas por fecha)
  const upcoming = tasks
    .filter(t => t.status !== "done")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 5);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* VFP card — el corazón del proyecto */}
      <div style={{
        background: vfpComplete ? "linear-gradient(135deg, rgba(61,126,255,0.08), rgba(168,85,247,0.06))" : "rgba(245,158,11,0.06)",
        border: `1px solid ${vfpComplete ? "rgba(61,126,255,0.3)" : "rgba(245,158,11,0.4)"}`,
        borderRadius: 12, padding: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: vfpComplete ? "rgba(61,126,255,0.15)" : "rgba(245,158,11,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Flag style={{ width: 16, height: 16, color: vfpComplete ? "#3D7EFF" : "#F59E0B" }} strokeWidth={2} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Valuable Final Product
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 700, color: "#E2E8F8" }}>
                {vfpComplete ? "Estamos construyendo esto" : "Sin VFP definido"}
              </p>
            </div>
          </div>
          <button onClick={() => setEditingVFP(true)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
            background: vfpComplete ? "rgba(61,126,255,0.12)" : "#F59E0B",
            color: vfpComplete ? "#3D7EFF" : "#fff",
            border: vfpComplete ? "1px solid rgba(61,126,255,0.4)" : "none",
            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {vfpComplete ? "Editar VFP" : "Definir VFP"}
          </button>
        </div>

        {vfpComplete ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {[
              { k: "producto", label: "Producto", v: vfp!.producto },
              { k: "para", label: "Para", v: vfp!.para },
              { k: "quien", label: "Quién", v: vfp!.quien },
              { k: "aDiferenciaDe", label: "A diferencia de", v: vfp!.aDiferenciaDe },
              { k: "terminadoCuando", label: "Terminado cuando", v: vfp!.terminadoCuando },
            ].filter(f => f.v).map(f => (
              <div key={f.k}>
                <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>{f.label}</p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#E2E8F8", lineHeight: 1.5 }}>{f.v}</p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "#C4CFEA", lineHeight: 1.6 }}>
            Antes de crear tareas, definí <strong>qué es estar terminado</strong>. Sin VFP, este proyecto es backlog basura.
            Forzar claridad al inicio es el único modo de evitar que se vuelva una lista infinita.
          </p>
        )}
      </div>

      {/* Owner + Health + Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {/* Owner */}
        <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Owner del proyecto
          </p>
          <p style={{ margin: "2px 0 12px", fontSize: 10, color: "#7A8BAD" }}>Posición del orgchart</p>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowOwnerPicker(p => !p)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "8px 10px", background: "#141928", border: "1px solid #1E2540",
              borderRadius: 6, cursor: "pointer", textAlign: "left",
            }}>
              {owner ? (
                <>
                  <EmployeeAvatar name={owner.fullName} employees={employees} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.fullName}</p>
                    {owner.jobTitle && <p style={{ margin: 0, fontSize: 11, color: "#7A8BAD", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.jobTitle}</p>}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 12, color: "#7A8BAD" }}>+ Asignar owner</span>
              )}
            </button>
            {showOwnerPicker && (
              <EmployeePicker value={owner?.fullName} employees={employees}
                onChange={(_n, id) => onProjectUpdate({ ownerEmployeeId: id })}
                onClose={() => setShowOwnerPicker(false)} />
            )}
          </div>
        </div>

        {/* Health */}
        <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Salud del proyecto
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: healthColor, boxShadow: `0 0 8px ${healthColor}` }} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: healthColor }}>{healthLabel}</p>
          </div>
          <div style={{ marginTop: 12, height: 6, background: "#1E2540", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10D9A0" : "#3D7EFF", transition: "width 0.4s" }} />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#7A8BAD", fontFamily: "monospace" }}>
            {done}/{total} tareas · {pct}%{overdue > 0 ? ` · ${overdue} atrasada${overdue !== 1 ? "s" : ""}` : ""}
          </p>
        </div>

        {/* Quick stats */}
        <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Acciones
          </p>
          <button onClick={onJumpToWork} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6,
            padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 0 12px rgba(61,126,255,0.3)",
          }}>
            Ver trabajo →
          </button>
        </div>
      </div>

      {/* Próximas tareas */}
      <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 18 }}>
        <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Próximas tareas
        </p>
        {upcoming.length === 0 ? (
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#7A8BAD" }}>
            Sin tareas pendientes. Pasá a la vista <strong>Lista</strong> para empezar a planear.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(t => {
              const due = formatDueDate(t.dueDate);
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", background: "#141928", border: "1px solid #1E2540", borderRadius: 6,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[t.status], flexShrink: 0 }} />
                  <p style={{ margin: 0, flex: 1, fontSize: 13, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </p>
                  {t.priority && (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${PRIORITY_COLORS[t.priority]}1F`, color: PRIORITY_COLORS[t.priority], border: `1px solid ${PRIORITY_COLORS[t.priority]}40`, fontFamily: "monospace", textTransform: "uppercase" }}>
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                  )}
                  {due && <span style={{ fontSize: 11, color: due.color, fontFamily: "monospace" }}>{due.label}</span>}
                  {(t.assigneeEmployeeId || t.assigneeName) && (
                    <EmployeeAvatar employeeId={t.assigneeEmployeeId} name={t.assigneeName} employees={employees} size={20} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingVFP && (
        <VFPEditor
          initialVFP={vfp ?? {}}
          onSave={v => { onProjectUpdate({ vfp: v }); setEditingVFP(false); }}
          onClose={() => setEditingVFP(false)}
        />
      )}
    </div>
  );
}

/* ─── VFP editor modal ─── */
function VFPEditor({ initialVFP, onSave, onClose }: {
  initialVFP: ProjectVFP; onSave: (v: ProjectVFP) => void; onClose: () => void;
}) {
  const [vfp, setVfp] = useState<ProjectVFP>(initialVFP);
  const fields: Array<{ key: keyof ProjectVFP; label: string; placeholder: string; required: boolean }> = [
    { key: "producto", label: "Producto", placeholder: "¿Qué estamos construyendo? Ej: \"App de delivery de comida\"", required: true },
    { key: "para", label: "Para", placeholder: "¿Para qué tipo de usuario? Ej: \"Restaurantes que quieren vender sin Rappi\"", required: true },
    { key: "quien", label: "Quién (el comprador)", placeholder: "¿Quién paga? Ej: \"Dueños de restaurantes pequeños\"", required: true },
    { key: "aDiferenciaDe", label: "A diferencia de", placeholder: "Ej: \"Rappi, que cobra 30% de comisión\"", required: false },
    { key: "terminadoCuando", label: "Terminado cuando", placeholder: "Ej: \"Un restaurante puede registrarse, subir su menú y recibir su primer pedido en menos de 1 hora\"", required: true },
  ];
  const valid = fields.filter(f => f.required).every(f => (vfp[f.key] ?? "").trim().length > 0);
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 12, width: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #1E2540", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#E2E8F8" }}>Valuable Final Product</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7A8BAD" }}>Definí qué es estar terminado antes de empezar a crear tareas.</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                {f.label}{f.required && <span style={{ color: "#F43F5E", marginLeft: 4 }}>*</span>}
              </label>
              <textarea value={vfp[f.key] ?? ""} onChange={e => setVfp(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder} rows={2}
                style={{
                  width: "100%", background: "#141928", border: "1px solid #1E2540", borderRadius: 6,
                  padding: "8px 12px", fontSize: 13, color: "#E2E8F8", outline: "none", resize: "vertical",
                  fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #1E2540", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={() => onSave(vfp)} disabled={!valid} style={{
            background: valid ? "#3D7EFF" : "#1E2540", color: "#fff", border: "none", borderRadius: 6,
            padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: valid ? "pointer" : "not-allowed",
            opacity: valid ? 1 : 0.5, boxShadow: valid ? "0 0 12px rgba(61,126,255,0.3)" : "none",
          }}>
            Guardar VFP
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Milestones view — entregables del proyecto con timeline ─── */
function MilestonesView({ projectId, milestones, tasks, employees, onMilestonesChange, embedded = false,
  updateTask, deleteTask, openDetail, createTaskInMilestone, bpmContext,
}: {
  projectId: string; milestones: Milestone[]; tasks: Task[]; employees: Employee[];
  onMilestonesChange: () => void;
  embedded?: boolean;
  // Opcionales — si se pasan, MilestoneCard puede mostrar sus tareas inline + agregar nuevas
  updateTask?: (id: string, updates: Partial<Task>) => void;
  deleteTask?: (id: string) => void;
  openDetail?: (t: Task) => void;
  createTaskInMilestone?: (milestoneId: string, title: string) => void;
  // Si el proyecto vino de un proceso BPM, permite vincular hitos con nodos del proceso
  bpmContext?: ProjectBpmContext;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Dependencias del DAG entre hitos del proyecto
  const [dependencies, setDependencies] = useState<Array<{ milestoneId: string; dependsOnId: string }>>([]);
  const loadDependencies = async () => {
    const res = await fetch(`/api/projects/${projectId}/milestone-dependencies`);
    if (res.ok) setDependencies(await res.json());
  };
  useEffect(() => { loadDependencies(); }, [projectId, milestones.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!newTitle.trim()) return;
    await fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle(""); setAdding(false);
    onMilestonesChange();
  };

  const update = async (id: string, updates: Partial<Milestone>) => {
    await fetch(`/api/projects/${projectId}/milestones/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    onMilestonesChange();
  };

  const remove = async (id: string) => {
    await fetch(`/api/projects/${projectId}/milestones/${id}`, { method: "DELETE" });
    onMilestonesChange();
  };

  // Timeline: rango de fechas mínimo→máximo entre los hitos con due date
  const datedMilestones = milestones.filter(m => m.dueDate);
  const timeline = (() => {
    if (datedMilestones.length === 0) return null;
    const times = datedMilestones.map(m => new Date(m.dueDate!).getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const range = maxT - minT || 86400000; // al menos 1 día para no dividir por 0
    return { minT, maxT, range };
  })();

  return (
    <div style={embedded
      ? { display: "flex", flexDirection: "column", gap: 12 }
      : { flex: 1, overflow: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header — solo cuando NO está embebido (el contenedor pone su propio título) */}
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Entregables
            </p>
            <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: "#E2E8F8" }}>Hitos del proyecto</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7A8BAD" }}>
              Cada hito necesita criterios de aceptación claros — sin eso, "completo" es subjetivo.
            </p>
          </div>
          {!adding && (
            <button onClick={() => setAdding(true)} style={{
              display: "flex", alignItems: "center", gap: 6, background: "#3D7EFF", color: "#fff",
              border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 0 12px rgba(61,126,255,0.3)",
            }}>
              <Plus style={{ width: 14, height: 14 }} strokeWidth={2.5} />
              Nuevo hito
            </button>
          )}
        </div>
      )}

      {/* Botón nuevo hito cuando está embebido — más compacto */}
      {embedded && !adding && (
        <button onClick={() => setAdding(true)} style={{
          alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5,
          background: "rgba(61,126,255,0.1)", color: "#3D7EFF", border: "1px solid rgba(61,126,255,0.3)",
          borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          <Plus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
          Nuevo hito
        </button>
      )}

      {/* Add inline */}
      {adding && (
        <div style={{ background: "rgba(61,126,255,0.06)", border: "1px solid rgba(61,126,255,0.3)", borderRadius: 8, padding: 14, display: "flex", gap: 8 }}>
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") create(); if (e.key === "Escape") { setAdding(false); setNewTitle(""); } }}
            placeholder='Título del hito — ej: "Beta lanzada con primeros 10 usuarios"'
            style={{ flex: 1, background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#E2E8F8", outline: "none" }} />
          <button onClick={create} style={{ background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Crear</button>
          <button onClick={() => { setAdding(false); setNewTitle(""); }} style={{ background: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
        </div>
      )}

      {/* Timeline horizontal — solo si hay hitos con fecha */}
      {timeline && datedMilestones.length > 1 && (
        <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: "18px 22px" }}>
          <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Timeline
          </p>
          <div style={{ position: "relative", height: 60, marginTop: 16 }}>
            {/* Línea base */}
            <div style={{ position: "absolute", top: 30, left: 0, right: 0, height: 2, background: "#1E2540", borderRadius: 1 }} />
            {/* Líneas de dependencia (arcos curvos sobre la base) */}
            {dependencies.length > 0 && (() => {
              const positions = new Map(datedMilestones.map(m => [
                m.id,
                ((new Date(m.dueDate!).getTime() - timeline.minT) / timeline.range) * 100,
              ]));
              return (
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  {dependencies.map((d, i) => {
                    const fromPct = positions.get(d.dependsOnId);
                    const toPct = positions.get(d.milestoneId);
                    if (fromPct === undefined || toPct === undefined) return null;
                    // Arc curvo desde from hasta to (puntos en la base ~ y=31)
                    const midPct = (fromPct + toPct) / 2;
                    const arcHeight = Math.abs(toPct - fromPct) > 30 ? -18 : -10;
                    return (
                      <path key={i}
                        d={`M ${fromPct}% 31 Q ${midPct}% ${31 + arcHeight} ${toPct}% 31`}
                        fill="none"
                        stroke="rgba(245,158,11,0.5)"
                        strokeWidth={1.2}
                        strokeDasharray="3,3"
                        markerEnd="url(#arrowhead)"
                      />
                    );
                  })}
                  <defs>
                    <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <polygon points="0 0, 6 3, 0 6" fill="rgba(245,158,11,0.7)" />
                    </marker>
                  </defs>
                </svg>
              );
            })()}
            {/* Marcadores */}
            {datedMilestones.map(m => {
              const t = new Date(m.dueDate!).getTime();
              const pct = ((t - timeline.minT) / timeline.range) * 100;
              const myDeps = dependencies.filter(d => d.milestoneId === m.id);
              const blocked = myDeps.some(d => {
                const dep = milestones.find(x => x.id === d.dependsOnId);
                return dep && dep.status !== "done";
              });
              return (
                <div key={m.id}
                  onClick={() => setEditingId(m.id)}
                  style={{
                    position: "absolute", top: 18, left: `${pct}%`, transform: "translateX(-50%)",
                    display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer",
                    zIndex: 2,
                  }}
                  title={`${m.title} — ${new Date(m.dueDate!).toLocaleDateString("es-AR")}${blocked ? " · BLOQUEADO por dependencias" : ""}`}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%",
                    background: MILESTONE_STATUS_COLORS[m.status],
                    boxShadow: `0 0 8px ${MILESTONE_STATUS_COLORS[m.status]}`,
                    border: `2px solid ${blocked ? "#F43F5E" : "#0E1220"}`,
                  }} />
                  <p style={{ margin: "6px 0 0", fontSize: 9, color: blocked ? "#F43F5E" : "#C4CFEA", maxWidth: 80, textAlign: "center", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.title}
                  </p>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
            <span>{new Date(timeline.minT).toLocaleDateString("es-AR")}</span>
            <span>{new Date(timeline.maxT).toLocaleDateString("es-AR")}</span>
          </div>
        </div>
      )}

      {/* Milestones list */}
      {milestones.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", border: "1px dashed #1E2540", borderRadius: 10, background: "#0E1220" }}>
          <Flag style={{ width: 32, height: 32, margin: "0 auto 8px", color: "#1E2540" }} strokeWidth={1.5} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#E2E8F8" }}>Sin hitos todavía</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7A8BAD" }}>
            Definí los entregables clave antes de empezar a crear tareas sueltas.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {milestones.map(m => (
            <MilestoneCard key={m.id} milestone={m} tasks={tasks} employees={employees}
              isEditing={editingId === m.id}
              onStartEdit={() => setEditingId(m.id)}
              onStopEdit={() => setEditingId(null)}
              onUpdate={updates => update(m.id, updates)}
              onDelete={() => remove(m.id)}
              updateTask={updateTask}
              deleteTask={deleteTask}
              openDetail={openDetail}
              createTaskInMilestone={createTaskInMilestone}
              bpmContext={bpmContext}
              allMilestones={milestones}
              dependencies={dependencies}
              onDependenciesChange={loadDependencies}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Milestone card ─── */
function MilestoneCard({ milestone, tasks, employees, isEditing, onStartEdit, onStopEdit, onUpdate, onDelete,
  updateTask, deleteTask, openDetail, createTaskInMilestone, bpmContext,
  allMilestones, dependencies, onDependenciesChange,
}: {
  milestone: Milestone; tasks: Task[]; employees: Employee[];
  isEditing: boolean; onStartEdit: () => void; onStopEdit: () => void;
  onUpdate: (updates: Partial<Milestone>) => void;
  onDelete: () => void;
  updateTask?: (id: string, updates: Partial<Task>) => void;
  deleteTask?: (id: string) => void;
  openDetail?: (t: Task) => void;
  createTaskInMilestone?: (milestoneId: string, title: string) => void;
  bpmContext?: ProjectBpmContext;
  // Para gestionar dependencias del DAG
  allMilestones?: Milestone[];
  dependencies?: Array<{ milestoneId: string; dependsOnId: string }>;
  onDependenciesChange?: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Milestone>>(milestone);
  const [showOwner, setShowOwner] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const toast = useToast();
  useEffect(() => { setDraft(milestone); }, [milestone]);

  const due = formatDueDate(milestone.dueDate);
  const milestoneTasks = tasks.filter(t => t.milestoneId === milestone.id);
  const doneTasks = milestoneTasks.filter(t => t.status === "done").length;
  const pct = milestoneTasks.length > 0 ? Math.round((doneTasks / milestoneTasks.length) * 100) : 0;
  const owner = milestone.ownerEmployeeId ? employees.find(e => e.id === milestone.ownerEmployeeId) : null;

  const save = () => {
    onUpdate({
      title: draft.title,
      description: draft.description ?? null,
      acceptanceCriteria: draft.acceptanceCriteria ?? null,
      dueDate: draft.dueDate,
      status: draft.status,
      bpmNodeId: draft.bpmNodeId,
    });
    onStopEdit();
  };

  if (!isEditing) {
    const canManageTasks = !!(updateTask && createTaskInMilestone);
    return (
      <div style={{
        background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10,
        overflow: "hidden",
        transition: "border-color 120ms",
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#3D7EFF66"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#1E2540"; }}
      >
        {/* Header — clickeable para editar */}
        <div style={{ padding: 18, cursor: "pointer" }} onClick={onStartEdit}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <Flag style={{ width: 18, height: 18, color: MILESTONE_STATUS_COLORS[milestone.status], flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#E2E8F8" }}>{milestone.title}</p>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4,
                  background: `${MILESTONE_STATUS_COLORS[milestone.status]}1F`,
                  color: MILESTONE_STATUS_COLORS[milestone.status],
                  border: `1px solid ${MILESTONE_STATUS_COLORS[milestone.status]}40`,
                  fontFamily: "monospace", textTransform: "uppercase",
                }}>
                  {MILESTONE_STATUS_LABELS[milestone.status]}
                </span>
                {due && <span style={{ fontSize: 11, color: due.color, fontFamily: "monospace" }}>{due.label}</span>}
              </div>
              {milestone.description && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#7A8BAD", lineHeight: 1.5 }}>{milestone.description}</p>
              )}
              {milestone.acceptanceCriteria && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(16,217,160,0.06)", border: "1px solid rgba(16,217,160,0.2)", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#10D9A0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Terminado cuando
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#C4CFEA", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {milestone.acceptanceCriteria}
                  </p>
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {owner && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <EmployeeAvatar employeeId={owner.id} employees={employees} size={20} />
                    <span style={{ fontSize: 11, color: "#7A8BAD" }}>{owner.fullName}</span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 60, height: 4, background: "#1E2540", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10D9A0" : "#3D7EFF" }} />
                  </div>
                  <span style={{ fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
                    {doneTasks}/{milestoneTasks.length} tareas
                  </span>
                </div>
                {/* Chip de dependencias: count si tiene */}
                {(() => {
                  const myDeps = (dependencies ?? []).filter(d => d.milestoneId === milestone.id);
                  if (myDeps.length === 0) return null;
                  const blocked = myDeps.some(d => {
                    const dep = allMilestones?.find(m => m.id === d.dependsOnId);
                    return dep && dep.status !== "done";
                  });
                  return (
                    <span title={`Depende de ${myDeps.length} hito${myDeps.length > 1 ? "s" : ""}${blocked ? " (bloqueado)" : ""}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 10, padding: "2px 8px", borderRadius: 4,
                        background: blocked ? "rgba(244,63,94,0.12)" : "rgba(245,158,11,0.08)",
                        color: blocked ? "#F43F5E" : "#F59E0B",
                        border: `1px solid ${blocked ? "rgba(244,63,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                        fontFamily: "monospace", textTransform: "uppercase",
                      }}>
                      ⇆ {myDeps.length} dep{myDeps.length > 1 ? "s" : ""}{blocked && " · BLOQUEADO"}
                    </span>
                  );
                })()}
                {/* Chip BPM: si está vinculado a un nodo del proceso */}
                {milestone.bpmNodeId && bpmContext?.hasProcess && (() => {
                  const node = bpmContext.nodes.find(n => n.id === milestone.bpmNodeId);
                  if (!node) return null;
                  const isCurrent = bpmContext.currentNodeId === node.id;
                  return (
                    <span title={`Vinculado al nodo BPM "${node.label}". Al completar avanza el proceso.`}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 10, padding: "2px 8px", borderRadius: 4,
                        background: isCurrent ? "rgba(168,85,247,0.18)" : "rgba(168,85,247,0.08)",
                        color: "#A855F7",
                        border: `1px solid ${isCurrent ? "#A855F7" : "rgba(168,85,247,0.3)"}`,
                        fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em",
                      }}>
                      ⚐ BPM: {node.label.slice(0, 18)}
                      {isCurrent && <span style={{ marginLeft: 3, fontWeight: 700 }}>· ACTUAL</span>}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Tareas del hito — collapsible. onClick stopPropagation para no disparar onStartEdit. */}
        {canManageTasks && (
          <div onClick={e => e.stopPropagation()} style={{ borderTop: "1px solid #1E2540", background: "#0A0E1A" }}>
            <button onClick={() => setTasksOpen(p => !p)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "8px 18px", background: "transparent", border: "none", cursor: "pointer",
              color: "#7A8BAD", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              {tasksOpen ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
              <span style={{ flex: 1, textAlign: "left" }}>
                Tareas del hito ({milestoneTasks.length})
              </span>
              {milestoneTasks.length > 0 && (
                <span style={{ color: "#10D9A0", fontFamily: "monospace" }}>{pct}%</span>
              )}
            </button>
            {tasksOpen && (
              <div style={{ padding: "0 14px 12px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                {milestoneTasks.length === 0 && (
                  <p style={{ margin: "4px 0 8px", fontSize: 11, color: "#3A4560", fontStyle: "italic" }}>
                    Sin tareas todavía. Agregá las acciones concretas que cierran este hito.
                  </p>
                )}
                {milestoneTasks.map(t => (
                  <MilestoneTaskRow key={t.id} task={t} employees={employees}
                    onCycleStatus={() => updateTask!(t.id, { status: NEXT_STATUS[t.status] })}
                    onOpenDetail={() => openDetail?.(t)}
                    onDelete={() => deleteTask?.(t.id)}
                  />
                ))}
                {/* Add new task */}
                <div style={{ marginTop: 6 }}>
                  {adding ? (
                    <form onSubmit={e => {
                      e.preventDefault();
                      if (!newTaskTitle.trim()) return;
                      createTaskInMilestone!(milestone.id, newTaskTitle.trim());
                      setNewTaskTitle(""); setAdding(false);
                    }} style={{ display: "flex", gap: 5 }}>
                      <input autoFocus value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape") { setAdding(false); setNewTaskTitle(""); } }}
                        onBlur={() => { if (!newTaskTitle.trim()) setAdding(false); }}
                        placeholder="Nueva tarea para este hito…"
                        style={{
                          flex: 1, background: "#141928", border: "1px solid #3D7EFF66",
                          borderRadius: 5, color: "#E2E8F8", fontSize: 12,
                          padding: "5px 10px", outline: "none",
                        }} />
                      <button type="submit" disabled={!newTaskTitle.trim()}
                        style={{ width: 26, height: 26, borderRadius: 5, background: "#3D7EFF", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: newTaskTitle.trim() ? 1 : 0.5 }}>
                        <Plus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setAdding(true)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", background: "transparent",
                      border: "1px dashed #1E2540", borderRadius: 5,
                      color: "#7A8BAD", fontSize: 11, cursor: "pointer", textAlign: "left",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#3D7EFF"; e.currentTarget.style.borderColor = "#3D7EFF66"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#7A8BAD"; e.currentTarget.style.borderColor = "#1E2540"; }}>
                      <Plus style={{ width: 11, height: 11 }} strokeWidth={2.5} />
                      Agregar tarea a este hito
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div style={{ background: "#0E1220", border: "1px solid #3D7EFF", borderRadius: 10, padding: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input value={draft.title ?? ""} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Título"
          style={{ background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "8px 12px", fontSize: 14, color: "#E2E8F8", outline: "none", fontWeight: 600 }} />
        <textarea value={draft.description ?? ""} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2}
          placeholder="Descripción breve del hito"
          style={{ background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#E2E8F8", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
        <div>
          <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", color: "#10D9A0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Terminado cuando (criterios de aceptación)
          </label>
          <textarea value={draft.acceptanceCriteria ?? ""} onChange={e => setDraft({ ...draft, acceptanceCriteria: e.target.value })} rows={3}
            placeholder="Lista los criterios concretos. Ej:&#10;- 5 usuarios completaron el flow sin asistencia&#10;- Tiempo medio < 90s&#10;- Cero errores 500 en último deploy"
            style={{ width: "100%", background: "#141928", border: "1px solid rgba(16,217,160,0.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#E2E8F8", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", marginBottom: 4 }}>Estado</label>
            <select value={draft.status ?? "pending"} onChange={e => setDraft({ ...draft, status: e.target.value as Milestone["status"] })}
              style={{ width: "100%", background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#E2E8F8", outline: "none" }}>
              <option value="pending">Pendiente</option>
              <option value="in_progress">En progreso</option>
              <option value="done">Completo</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", marginBottom: 4 }}>Vencimiento</label>
            <input type="date" value={draft.dueDate ? draft.dueDate.slice(0, 10) : ""} onChange={e => setDraft({ ...draft, dueDate: e.target.value || undefined })}
              style={{ width: "100%", background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#E2E8F8", outline: "none", colorScheme: "dark" }} />
          </div>
          <div style={{ position: "relative" }}>
            <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", marginBottom: 4 }}>Owner</label>
            <button onClick={() => setShowOwner(p => !p)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              background: "#141928", border: "1px solid #1E2540", borderRadius: 6,
              padding: "5px 10px", fontSize: 12, color: "#E2E8F8", cursor: "pointer", textAlign: "left",
            }}>
              {owner ? <><EmployeeAvatar employeeId={owner.id} employees={employees} size={18} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.fullName}</span></> : <span style={{ color: "#7A8BAD" }}>+ Asignar</span>}
            </button>
            {showOwner && (
              <EmployeePicker value={owner?.fullName} employees={employees}
                onChange={(_n, id) => onUpdate({ ownerEmployeeId: id })}
                onClose={() => setShowOwner(false)} />
            )}
          </div>
        </div>

        {/* Dependencias entre hitos — DAG */}
        {allMilestones && allMilestones.length > 1 && (
          <div>
            <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              ⇆ Depende de
            </label>
            <p style={{ margin: "0 0 6px", fontSize: 10, color: "#7A8BAD" }}>
              Hitos que deben completarse antes de empezar éste.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(dependencies ?? []).filter(d => d.milestoneId === milestone.id).map(d => {
                const dep = allMilestones.find(m => m.id === d.dependsOnId);
                if (!dep) return null;
                return (
                  <div key={d.dependsOnId} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", background: "#141928",
                    border: "1px solid rgba(245,158,11,0.3)", borderRadius: 5,
                  }}>
                    <Flag style={{ width: 11, height: 11, color: MILESTONE_STATUS_COLORS[dep.status], flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.title}</span>
                    <button onClick={async () => {
                      await fetch(`/api/milestones/${milestone.id}/dependencies/${d.dependsOnId}`, { method: "DELETE" });
                      onDependenciesChange?.();
                    }} title="Quitar dependencia"
                      style={{ background: "transparent", border: "none", color: "#F43F5E", cursor: "pointer", padding: 2, opacity: 0.6 }}>
                      <X style={{ width: 11, height: 11 }} />
                    </button>
                  </div>
                );
              })}
              <select value=""
                onChange={async e => {
                  if (!e.target.value) return;
                  const res = await fetch(`/api/milestones/${milestone.id}/dependencies`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dependsOnId: e.target.value }),
                  });
                  if (res.ok) {
                    onDependenciesChange?.();
                    toast.success("Dependencia agregada");
                  } else {
                    const err = await res.json().catch(() => ({}));
                    toast.error("No se pudo agregar", err.error ?? "Verificá que no genere un ciclo.");
                  }
                }}
                style={{ background: "#141928", border: "1px dashed rgba(245,158,11,0.3)", borderRadius: 5, padding: "6px 10px", fontSize: 12, color: "#7A8BAD", outline: "none", cursor: "pointer" }}>
                <option value="">+ Agregar dependencia…</option>
                {allMilestones.filter(m => m.id !== milestone.id && !(dependencies ?? []).some(d => d.milestoneId === milestone.id && d.dependsOnId === m.id))
                  .map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* BPM node link — solo si el proyecto vino de un proceso */}
        {bpmContext?.hasProcess && bpmContext.nodes.length > 0 && (
          <div>
            <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", color: "#A855F7", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              ⚐ Vincular a nodo del proceso BPM
            </label>
            <p style={{ margin: "0 0 6px", fontSize: 10, color: "#7A8BAD" }}>
              Al completar este hito se avanza automáticamente el nodo seleccionado en <strong>{bpmContext.processName}</strong>.
            </p>
            <select value={draft.bpmNodeId ?? ""}
              onChange={e => setDraft({ ...draft, bpmNodeId: e.target.value || null })}
              style={{ width: "100%", background: "#141928", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#E2E8F8", outline: "none", cursor: "pointer" }}>
              <option value="">Sin vínculo BPM</option>
              {bpmContext.nodes.map(n => (
                <option key={n.id} value={n.id}>
                  [{n.type === "userTask" ? "Tarea" : n.type === "serviceTask" ? "Servicio" : "Nodo"}] {n.label}
                  {bpmContext.currentNodeId === n.id ? "  · ACTUAL" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } onDelete(); }}
            style={{
              background: confirmDelete ? "#F43F5E" : "transparent", color: confirmDelete ? "#fff" : "#F43F5E",
              border: "1px solid #F43F5E55", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer",
              marginRight: "auto", display: "flex", alignItems: "center", gap: 5,
            }}>
            <Trash2 style={{ width: 12, height: 12 }} />
            {confirmDelete ? "Confirmar" : "Eliminar"}
          </button>
          <button onClick={onStopEdit} style={{ background: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={save} style={{ background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Project Modal — vista unificada flotante: VFP + Stats + Hitos + Tareas ─── */
function ProjectModal(props: {
  project: Project; tasks: Task[]; visibleTasks: Task[]; milestones: Milestone[]; employees: Employee[];
  onClose: () => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
  newTaskTitle: string; setNewTaskTitle: (v: string) => void;
  createTask: (status: Status, section?: string, titleOverride?: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  openDetail: (t: Task) => void;
  detailTask: Task | null; setDetailTask: (t: Task | null) => void;
  editingTask: Partial<Task>; setEditingTask: (v: Partial<Task>) => void;
  saveDetail: () => void;
  getTasksByStatus: (status: Status) => Task[];
  getTasksBySection: (s: string) => Task[];
  allSections: string[];
  collapsedSections: Set<string>; toggleSection: (s: string) => void;
  expandedTask: string | null; setExpandedTask: (id: string | null) => void;
  addingTaskSection: string | null; setAddingTaskSection: (s: string | null) => void;
  inlineTaskTitle: string; setInlineTaskTitle: (v: string) => void;
  inlineInputRef: React.RefObject<HTMLInputElement | null>;
  addingSection: boolean; setAddingSection: (v: boolean) => void;
  newSectionName: string; setNewSectionName: (v: string) => void;
  addSection: () => void;
  filterStatus: Set<Status>; setFilterStatus: (s: Set<Status>) => void;
  filterPriority: Set<Priority>; setFilterPriority: (s: Set<Priority>) => void;
  filterAssignee: string | null; setFilterAssignee: (a: string | null) => void;
  taskSearch: string; setTaskSearch: (s: string) => void;
  totalTasks: number; filteredCount: number;
  selectedIds: Set<string>; setSelectedIds: (s: Set<string>) => void;
  bulkUpdate: (updates: Partial<Task>) => void; bulkDelete: () => void;
  fetchMilestones: () => void;
  createTaskInMilestone: (milestoneId: string, title: string) => void;
  createTaskFull: (opts: { title: string; status?: Status; dueDate?: string; milestoneId?: string }) => void;
}) {
  const { project, tasks, visibleTasks, milestones, employees, onClose, onProjectUpdate } = props;
  const [tasksView, setTasksView] = useState<"list" | "board">("list");
  const [editingVFP, setEditingVFP] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const toast = useToast();
  // Contexto BPM: si el proyecto vino de un proceso, traemos sus nodos para vincular hitos
  const [bpmContext, setBpmContext] = useState<ProjectBpmContext>({ hasProcess: false, nodes: [] });
  useEffect(() => {
    fetch(`/api/projects/${project.id}/bpm-nodes`).then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setBpmContext(data); })
      .catch(() => {});
  }, [project.id]);

  // VFP + health (lógica de SummaryView)
  const vfp = project.vfp ?? null;
  const vfpComplete = !!(vfp && vfp.producto && vfp.para && vfp.quien && vfp.terminadoCuando);
  const owner = employees.find(e => e.id === project.ownerEmployeeId);
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const health: "atrasado" | "completo" | "bien" | "iniciando" | "vacio" =
    overdue > 0 ? "atrasado" : pct === 100 ? "completo" : pct >= 50 ? "bien" : total === 0 ? "vacio" : "iniciando";
  const healthColor = { atrasado: "#F43F5E", completo: "#10D9A0", bien: "#10D9A0", iniciando: "#3D7EFF", vacio: "#7A8BAD" }[health];
  const healthLabel = { atrasado: "Atrasado", completo: "Completo", bien: "En buen ritmo", iniciando: "Iniciando", vacio: "Sin trabajo" }[health];

  // ESC cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editingVFP && !showOwnerPicker) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editingVFP, showOwnerPicker]);

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 80, padding: 24,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "stretch", justifyContent: "center",
      }}
    >
      <div style={{
        width: "min(1200px, 100%)", maxHeight: "100%",
        background: "#080B12", border: "1px solid #1E2540",
        borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Sticky header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 22px", borderBottom: "1px solid #1E2540",
          background: "rgba(14,18,32,0.98)",
        }}>
          <button onClick={onClose} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
            background: "transparent", border: "1px solid #1E2540", borderRadius: 6,
            color: "#7A8BAD", fontSize: 12, cursor: "pointer",
          }}>
            <ArrowLeft style={{ width: 13, height: 13 }} />
            Volver
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Proyecto
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 700, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {project.name}
            </p>
          </div>
          <span style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: `${healthColor}1F`, color: healthColor, border: `1px solid ${healthColor}55`,
            fontFamily: "monospace", textTransform: "uppercase",
          }}>
            {healthLabel}
          </span>
          {/* Status del proyecto — dropdown para archivar/pausar/cancelar */}
          <select value={project.status ?? "activo"}
            onChange={e => onProjectUpdate({ status: e.target.value })}
            title="Estado del proyecto"
            style={{
              fontSize: 11, padding: "4px 8px", borderRadius: 4,
              background: "#141928", color: "#C4CFEA", border: "1px solid #1E2540",
              cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
            }}>
            <option value="planning">Planning</option>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <button onClick={async () => {
              const name = prompt(`Guardar "${project.name}" como template — nombre del template:`, `Template: ${project.name}`);
              if (!name?.trim()) return;
              const res = await fetch("/api/project-templates", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), fromProjectId: project.id, description: project.description }),
              });
              if (res.ok) toast.success("Template guardado", "Lo encontrás en \"Desde template\" del hub.");
              else toast.error("No se pudo guardar el template");
            }}
            title="Guardar este proyecto como template"
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 4,
              background: "rgba(168,85,247,0.1)", color: "#A855F7", border: "1px solid rgba(168,85,247,0.3)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}>
            <Folder style={{ width: 11, height: 11 }} />
            Como template
          </button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {/* ── SECCIÓN VFP ─────────────────────────────────────────── */}
          <section style={{ padding: "22px 24px 0" }}>
            <div style={{
              background: vfpComplete ? "linear-gradient(135deg, rgba(61,126,255,0.08), rgba(168,85,247,0.06))" : "rgba(245,158,11,0.06)",
              border: `1px solid ${vfpComplete ? "rgba(61,126,255,0.3)" : "rgba(245,158,11,0.4)"}`,
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: vfpComplete ? "rgba(61,126,255,0.15)" : "rgba(245,158,11,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Flag style={{ width: 15, height: 15, color: vfpComplete ? "#3D7EFF" : "#F59E0B" }} strokeWidth={2} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Valuable Final Product
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "#E2E8F8" }}>
                      {vfpComplete ? "Estamos construyendo esto" : "Sin VFP definido"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setEditingVFP(true)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
                  background: vfpComplete ? "rgba(61,126,255,0.12)" : "#F59E0B",
                  color: vfpComplete ? "#3D7EFF" : "#fff",
                  border: vfpComplete ? "1px solid rgba(61,126,255,0.4)" : "none",
                  borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  {vfpComplete ? "Editar VFP" : "Definir VFP"}
                </button>
              </div>
              {vfpComplete ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {[
                    { k: "producto", label: "Producto", v: vfp!.producto },
                    { k: "para", label: "Para", v: vfp!.para },
                    { k: "quien", label: "Quién", v: vfp!.quien },
                    { k: "aDiferenciaDe", label: "A diferencia de", v: vfp!.aDiferenciaDe },
                    { k: "terminadoCuando", label: "Terminado cuando", v: vfp!.terminadoCuando },
                  ].filter(f => f.v).map(f => (
                    <div key={f.k}>
                      <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>{f.label}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#E2E8F8", lineHeight: 1.5 }}>{f.v}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "#C4CFEA", lineHeight: 1.6 }}>
                  Antes de crear tareas, definí <strong>qué es estar terminado</strong>. Sin VFP, este proyecto es backlog basura.
                </p>
              )}
            </div>
          </section>

          {/* ── SECCIÓN STATS (Owner + Health + Quick) ──────────────── */}
          <section style={{ padding: "16px 24px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {/* Owner */}
              <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 14 }}>
                <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Owner (posición orgchart)
                </p>
                <div style={{ position: "relative", marginTop: 10 }}>
                  <button onClick={() => setShowOwnerPicker(p => !p)} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "7px 10px", background: "#141928", border: "1px solid #1E2540",
                    borderRadius: 6, cursor: "pointer", textAlign: "left",
                  }}>
                    {owner ? (
                      <>
                        <EmployeeAvatar employeeId={owner.id} employees={employees} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12.5, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.fullName}</p>
                          {owner.jobTitle && <p style={{ margin: 0, fontSize: 10, color: "#7A8BAD", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.jobTitle}</p>}
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "#7A8BAD" }}>+ Asignar owner</span>
                    )}
                  </button>
                  {showOwnerPicker && (
                    <EmployeePicker value={owner?.fullName} employees={employees}
                      onChange={(_n, id) => onProjectUpdate({ ownerEmployeeId: id })}
                      onClose={() => setShowOwnerPicker(false)} />
                  )}
                </div>
              </div>

              {/* Health */}
              <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 14 }}>
                <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Salud del proyecto
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: healthColor, boxShadow: `0 0 6px ${healthColor}` }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: healthColor }}>{healthLabel}</p>
                </div>
                <div style={{ marginTop: 10, height: 5, background: "#1E2540", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10D9A0" : "#3D7EFF", transition: "width 0.4s" }} />
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
                  {done}/{total} · {pct}%{overdue > 0 ? ` · ${overdue} atrasada${overdue !== 1 ? "s" : ""}` : ""}
                </p>
              </div>

              {/* Stats counts */}
              <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Resumen
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <Stat label="Tareas" value={total} />
                  <Stat label="Hitos" value={milestones.length} color="#A855F7" />
                </div>
              </div>
            </div>
          </section>

          {/* ── SECCIÓN EQUIPO ─────────────────────────────────────── */}
          <section style={{ padding: "20px 24px 0" }}>
            <TeamSection projectId={project.id} employees={employees} />
          </section>

          {/* ── SECCIÓN ACTIVIDAD ──────────────────────────────────── */}
          <section style={{ padding: "18px 24px 0" }}>
            <ActivityFeed projectId={project.id} />
          </section>

          {/* ── SECCIÓN HITOS ──────────────────────────────────────── */}
          <section style={{ padding: "20px 24px 0" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 11, fontFamily: "monospace", color: "#A855F7", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              ▸ Hitos / Entregables
            </h3>
            <MilestonesView
              projectId={project.id}
              milestones={milestones}
              tasks={tasks}
              employees={employees}
              onMilestonesChange={props.fetchMilestones}
              embedded
              updateTask={props.updateTask}
              deleteTask={props.deleteTask}
              openDetail={props.openDetail}
              createTaskInMilestone={props.createTaskInMilestone}
              bpmContext={bpmContext}
            />
          </section>

          {/* ── SECCIÓN TAREAS ─────────────────────────────────────── */}
          <section style={{ padding: "8px 24px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 11, fontFamily: "monospace", color: "#3D7EFF", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                ▸ Tareas
              </h3>
              {/* Search input — busca por título / descripción dentro del proyecto */}
              <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360, marginLeft: "auto" }}>
                <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#7A8BAD", pointerEvents: "none" }} />
                <input
                  value={props.taskSearch}
                  onChange={e => props.setTaskSearch(e.target.value)}
                  placeholder="Buscar tareas…"
                  style={{
                    width: "100%", background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6,
                    padding: "6px 28px 6px 28px", fontSize: 12, color: "#E2E8F8", outline: "none",
                  }}
                />
                {props.taskSearch && (
                  <button onClick={() => props.setTaskSearch("")}
                    style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer", padding: 2 }}>
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                )}
              </div>
              <div style={{ display: "flex", background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6, overflow: "hidden" }}>
                {(["list", "board"] as const).map(v => (
                  <button key={v} onClick={() => setTasksView(v)} style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", fontSize: 12, border: "none", cursor: "pointer",
                    background: tasksView === v ? "#1E2540" : "transparent",
                    color: tasksView === v ? "#E2E8F8" : "#7A8BAD",
                  }}>
                    {v === "list" ? <List style={{ width: 12, height: 12 }} /> : <LayoutGrid style={{ width: 12, height: 12 }} />}
                    {v === "list" ? "Lista" : "Tablero"}
                  </button>
                ))}
              </div>
            </div>

            <FilterBar
              filterStatus={props.filterStatus} setFilterStatus={props.setFilterStatus}
              filterPriority={props.filterPriority} setFilterPriority={props.setFilterPriority}
              filterAssignee={props.filterAssignee} setFilterAssignee={props.setFilterAssignee}
              employees={employees} totalTasks={props.totalTasks} filteredCount={props.filteredCount}
            />

            {props.selectedIds.size > 0 && (
              <BulkActionBar
                count={props.selectedIds.size}
                employees={employees}
                onStatusChange={s => props.bulkUpdate({ status: s })}
                onPriorityChange={p => props.bulkUpdate({ priority: p })}
                onAssigneeChange={(n, id) => props.bulkUpdate({ assigneeName: n, assigneeEmployeeId: id })}
                onDelete={props.bulkDelete}
                onClear={() => props.setSelectedIds(new Set())}
              />
            )}

            <div style={{ minHeight: 360, display: "flex", flexDirection: "column", border: "1px solid #1E2540", borderRadius: 8, overflow: "hidden", background: "#080B12" }}>
              {tasksView === "list" ? (
                <ListView
                  sections={props.allSections}
                  collapsedSections={props.collapsedSections}
                  toggleSection={props.toggleSection}
                  expandedTask={props.expandedTask}
                  setExpandedTask={props.setExpandedTask}
                  detailTask={props.detailTask}
                  openDetail={props.openDetail}
                  setDetailTask={props.setDetailTask}
                  editingTask={props.editingTask}
                  setEditingTask={props.setEditingTask}
                  saveDetail={props.saveDetail}
                  deleteTask={props.deleteTask}
                  updateTask={props.updateTask}
                  addingTaskSection={props.addingTaskSection}
                  setAddingTaskSection={props.setAddingTaskSection}
                  inlineTaskTitle={props.inlineTaskTitle}
                  setInlineTaskTitle={props.setInlineTaskTitle}
                  inlineInputRef={props.inlineInputRef}
                  createTask={props.createTask}
                  addingSection={props.addingSection}
                  setAddingSection={props.setAddingSection}
                  newSectionName={props.newSectionName}
                  setNewSectionName={props.setNewSectionName}
                  addSection={props.addSection}
                  getTasksBySection={props.getTasksBySection}
                  employees={employees}
                  milestones={milestones}
                  selectedIds={props.selectedIds}
                  setSelectedIds={props.setSelectedIds}
                />
              ) : (
                <TimelineBoardView
                  visibleTasks={visibleTasks}
                  employees={employees}
                  milestones={milestones}
                  updateTask={props.updateTask}
                  deleteTask={props.deleteTask}
                  openDetail={props.openDetail}
                  createTask={props.createTask}
                  createTaskFull={props.createTaskFull}
                />
              )}
            </div>
          </section>
        </div>

        {/* VFP editor modal */}
        {editingVFP && (
          <VFPEditor
            initialVFP={vfp ?? {}}
            onSave={v => { onProjectUpdate({ vfp: v }); setEditingVFP(false); }}
            onClose={() => setEditingVFP(false)}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = "#3D7EFF" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 9, color: "#7A8BAD", fontFamily: "monospace", textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

/* ─── Equipo del proyecto ─── */
interface ProjectMember {
  id: string; projectId: string; employeeId: string | null; role: string;
  fullName: string | null; jobTitle: string | null; color: string | null;
}

const MEMBER_ROLES: Array<{ value: string; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "member", label: "Miembro" },
  { value: "viewer", label: "Observador" },
];

function TeamSection({ projectId, employees }: { projectId: string; employees: Employee[] }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const loadMembers = async () => {
    const res = await fetch(`/api/projects/${projectId}/members`);
    if (res.ok) setMembers(await res.json());
  };
  useEffect(() => { loadMembers(); }, [projectId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const addMember = async (employeeId: string) => {
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, role: "member" }),
    });
    if (res.ok) await loadMembers();
  };

  const updateRole = async (memberId: string, newRole: string) => {
    // No hay PATCH endpoint todavía → simulamos: delete + re-add con nuevo role
    const m = members.find(x => x.id === memberId);
    if (!m || !m.employeeId) return;
    // Optimistic
    setMembers(prev => prev.map(x => x.id === memberId ? { ...x, role: newRole } : x));
    // Best-effort: la API no tiene PUT, así que por ahora dejamos solo optimistic + reload
    // TODO: agregar PUT al endpoint members. Por ahora el cambio es solo client-side.
  };

  const removeMember = async (memberId: string) => {
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (res.ok) setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  // Empleados que NO son ya miembros del proyecto
  const availableEmployees = employees.filter(e =>
    !members.some(m => m.employeeId === e.id) && e.fullName !== "[Puesto vacante]"
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 11, fontFamily: "monospace", color: "#10D9A0", textTransform: "uppercase", letterSpacing: "0.12em" }}>
        ▸ Equipo del proyecto
      </h3>
      <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: 14 }}>
        {members.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "#7A8BAD", fontStyle: "italic" }}>
            Sin miembros asignados. Agregá a las personas que trabajan en este proyecto.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map(m => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px", background: "#141928",
                border: "1px solid #1E2540", borderRadius: 6,
              }}>
                {m.employeeId && (
                  <EmployeeAvatar employeeId={m.employeeId} employees={employees} size={26} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.fullName ?? "Sin nombre"}
                  </p>
                  {m.jobTitle && (
                    <p style={{ margin: 0, fontSize: 10, color: "#7A8BAD" }}>{m.jobTitle}</p>
                  )}
                </div>
                <select value={m.role} onChange={e => updateRole(m.id, e.target.value)}
                  style={{
                    fontSize: 11, padding: "3px 7px", borderRadius: 4,
                    background: "#0E1220", border: "1px solid #1E2540", color: "#C4CFEA",
                    cursor: "pointer",
                  }}>
                  {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => removeMember(m.id)} title="Quitar del equipo"
                  style={{ background: "transparent", border: "none", color: "#F43F5E", cursor: "pointer", padding: 2, opacity: 0.6 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "0.6"; }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ position: "relative", marginTop: 12 }}>
          {showPicker ? (
            <EmployeePicker value={undefined} employees={availableEmployees}
              onChange={(_n, id) => { if (id) { addMember(id); setShowPicker(false); } }}
              onClose={() => setShowPicker(false)} />
          ) : (
            <button onClick={() => setShowPicker(true)} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(16,217,160,0.1)", color: "#10D9A0",
              border: "1px solid rgba(16,217,160,0.3)", borderRadius: 6,
              padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
              Agregar miembro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Activity feed — eventos recientes del proyecto ─── */
interface ActivityEvent {
  id: string; type: string; payload: Record<string, unknown>;
  createdAt: string;
  actorUserId: string | null;
  actorFullName?: string | null; actorEmail?: string | null; actorImageUrl?: string | null;
}

const ACTIVITY_META: Record<string, { icon: string; verb: string; color: string }> = {
  task_created: { icon: "+", verb: "creó la tarea", color: "#3D7EFF" },
  task_completed: { icon: "✓", verb: "completó la tarea", color: "#10D9A0" },
  task_assigned: { icon: "→", verb: "reasignó la tarea", color: "#A855F7" },
  task_deleted: { icon: "×", verb: "eliminó la tarea", color: "#F43F5E" },
  milestone_created: { icon: "⚐", verb: "creó el hito", color: "#A855F7" },
  milestone_completed: { icon: "✓", verb: "completó el hito", color: "#10D9A0" },
  milestone_deleted: { icon: "×", verb: "eliminó el hito", color: "#F43F5E" },
  vfp_updated: { icon: "★", verb: "actualizó el VFP", color: "#F59E0B" },
  owner_changed: { icon: "👤", verb: "cambió el owner", color: "#A855F7" },
  comment_added: { icon: "💬", verb: "comentó", color: "#3D7EFF" },
};

function ActivityFeed({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/activity?limit=20`).then(r => r.ok ? r.json() : [])
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, [projectId]);

  const visible = expanded ? events : events.slice(0, 5);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return "ahora";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 11, fontFamily: "monospace", color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.12em" }}>
        ▸ Actividad reciente
      </h3>
      {events.length === 0 ? (
        <div style={{ padding: "14px 18px", background: "#0E1220", border: "1px dashed #1E2540", borderRadius: 8, fontSize: 12, color: "#7A8BAD" }}>
          Aún no hay actividad registrada en este proyecto.
        </div>
      ) : (
        <div style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map(e => {
              const meta = ACTIVITY_META[e.type] ?? { icon: "•", verb: e.type, color: "#7A8BAD" };
              const actorName = e.actorFullName ?? e.actorEmail ?? "Alguien";
              const payload = e.payload as { title?: string; preview?: string };
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "4px 0" }}>
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                    background: `${meta.color}1F`, color: meta.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                  }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#C4CFEA", lineHeight: 1.4 }}>
                      <strong style={{ color: "#E2E8F8" }}>{actorName}</strong>
                      {" "}{meta.verb}
                      {payload.title && <span style={{ color: "#7A8BAD" }}> &quot;{String(payload.title).slice(0, 50)}{String(payload.title).length > 50 ? "…" : ""}&quot;</span>}
                    </p>
                    {payload.preview && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7A8BAD", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        &quot;{String(payload.preview)}&quot;
                      </p>
                    )}
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
          {events.length > 5 && (
            <button onClick={() => setExpanded(p => !p)} style={{
              marginTop: 10, fontSize: 11, padding: "5px 10px", borderRadius: 4,
              background: "transparent", border: "1px solid #1E2540", color: "#7A8BAD",
              cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
              width: "100%",
            }}>
              {expanded ? `Ver menos` : `Ver más (${events.length - 5})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Mini row de tarea dentro del MilestoneCard ─── */
function MilestoneTaskRow({ task, employees, onCycleStatus, onOpenDetail, onDelete }: {
  task: Task; employees: Employee[];
  onCycleStatus: () => void; onOpenDetail: () => void; onDelete: () => void;
}) {
  const isDone = task.status === "done";
  const due = formatDueDate(task.dueDate);
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px", borderRadius: 5,
        background: hovered ? "#141928" : "transparent",
        transition: "background 80ms",
      }}>
      {/* Status dot — click cycle */}
      <button onClick={onCycleStatus}
        title={`${STATUS_LABELS[task.status]} — click para avanzar`}
        style={{
          width: 14, height: 14, borderRadius: "50%",
          border: `2px solid ${STATUS_COLORS[task.status]}`,
          background: isDone ? STATUS_COLORS[task.status] : "transparent",
          cursor: "pointer", padding: 0, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {isDone && <span style={{ color: "#080B12", fontSize: 7, fontWeight: 900 }}>✓</span>}
      </button>
      {/* Title */}
      <span onClick={onOpenDetail}
        style={{
          flex: 1, fontSize: 12, color: isDone ? "#7A8BAD" : "#E2E8F8",
          textDecoration: isDone ? "line-through" : "none",
          cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
        {task.title}
      </span>
      {/* Priority dot */}
      {task.priority && (
        <span title={`Prioridad ${PRIORITY_LABELS[task.priority]}`}
          style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />
      )}
      {/* Due */}
      {due && <span style={{ fontSize: 10, color: due.color, fontFamily: "monospace", flexShrink: 0 }}>{due.label}</span>}
      {/* Avatar */}
      {(task.assigneeEmployeeId || task.assigneeName) && (
        <EmployeeAvatar employeeId={task.assigneeEmployeeId} name={task.assigneeName} employees={employees} size={16} />
      )}
      {/* Delete — solo al hover */}
      <button onClick={onDelete}
        style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 2,
          color: "#F43F5E", opacity: hovered ? 0.7 : 0, transition: "opacity 100ms",
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "0.7"; }}>
        <Trash2 style={{ width: 11, height: 11 }} />
      </button>
    </div>
  );
}

/* ─── Board task card ─── */
function BoardCard({ task, employees, onOpenDetail, onDelete, isDragging }: {
  task: Task; employees: Employee[]; onOpenDetail: () => void; onDelete: () => void; isDragging?: boolean;
}) {
  const dueDateInfo = formatDueDate(task.dueDate);
  return (
    <div style={{
      borderRadius: 6, padding: "10px 12px",
      background: "#141928", border: `1px solid ${isDragging ? "#3D7EFF" : "#1E2540"}`,
      boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
      cursor: "grab", opacity: isDragging ? 0.6 : 1,
      transition: "border-color 120ms",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <p onClick={e => { e.stopPropagation(); onOpenDetail(); }}
          style={{ flex: 1, fontSize: 13, lineHeight: 1.35, color: "#E2E8F8", margin: 0, cursor: "pointer" }}>
          {task.title}
        </p>
        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ color: "#7A8BAD", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "0.4"; }}>
          <Trash2 style={{ width: 11, height: 11 }} strokeWidth={1.75} />
        </button>
      </div>
      {task.description && (
        <p style={{ marginTop: 4, fontSize: 11, color: "#7A8BAD", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {task.description}
        </p>
      )}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {task.priority && (
          <span style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 9, padding: "2px 6px", borderRadius: 3,
            background: `${PRIORITY_COLORS[task.priority]}1F`, color: PRIORITY_COLORS[task.priority],
            border: `1px solid ${PRIORITY_COLORS[task.priority]}40`, fontFamily: "monospace", textTransform: "uppercase",
          }}>
            <Flag style={{ width: 8, height: 8 }} /> {PRIORITY_LABELS[task.priority]}
          </span>
        )}
        {dueDateInfo && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: dueDateInfo.color, fontFamily: "monospace" }}>
            <Calendar style={{ width: 9, height: 9 }} /> {dueDateInfo.label}
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          {(task.assigneeEmployeeId || task.assigneeName) && (
            <EmployeeAvatar employeeId={task.assigneeEmployeeId} name={task.assigneeName} employees={employees} size={20} />
          )}
        </span>
      </div>
    </div>
  );
}

/* ─── Draggable wrapper ─── */
function DraggableBoardCard({ task, employees, onOpenDetail, onDelete }: {
  task: Task; employees: Employee[]; onOpenDetail: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <BoardCard task={task} employees={employees} onOpenDetail={onOpenDetail} onDelete={onDelete} isDragging={isDragging} />
    </div>
  );
}

/* ─── Droppable column ─── */
function DroppableColumn({ status, section, children }: { status: Status; section: string; children: React.ReactNode }) {
  const id = `${section}::${status}`;
  const { setNodeRef, isOver } = useDroppable({ id, data: { status, section } });
  return (
    <div ref={setNodeRef} style={{
      flex: 1, minHeight: 80, display: "flex", flexDirection: "column", gap: 8, padding: 8,
      background: isOver ? "rgba(61,126,255,0.08)" : "transparent",
      border: isOver ? "1px dashed #3D7EFF66" : "1px dashed transparent",
      borderRadius: 6, transition: "background 100ms, border-color 100ms",
    }}>
      {children}
    </div>
  );
}

/* ─── Timeline Tablero — agrupado por urgencia temporal (no por status) ─── */
// Filosofía: el día a día no es "qué hay en in_review", es "qué tengo HOY".
// El status sigue siendo importante por tarea (chip clickeable cyclea), pero NO es
// el eje organizativo. Drag entre columnas cambia el due_date, no el status.

type TimelineBucket = "today" | "week" | "later";

function timelineCategorize(t: Task, now: Date, weekFromNow: Date): TimelineBucket {
  // Tareas done se mandan al final ("later") para que no contaminen "hoy"
  if (t.status === "done") return "later";
  if (!t.dueDate) return "later";
  const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
  if (due <= now) return "today";
  if (due < weekFromNow) return "week";
  return "later";
}

const TIMELINE_BUCKETS: Array<{ id: TimelineBucket; label: string; icon: string; accent: string; subtitle: string }> = [
  { id: "today", label: "Hoy / Atrasadas", icon: "🔥", accent: "#F43F5E", subtitle: "Vence hoy o ya pasó" },
  { id: "week", label: "Esta semana", icon: "📅", accent: "#F59E0B", subtitle: "Próximos 7 días" },
  { id: "later", label: "Por venir / Sin fecha", icon: "📦", accent: "#7A8BAD", subtitle: "Resto del backlog" },
];

const NEXT_STATUS: Record<Status, Status> = {
  todo: "in_progress", in_progress: "in_review", in_review: "done", done: "todo",
};

function TimelineCard({ task, employees, milestones, onOpenDetail, onDelete, onCycleStatus, isDragging }: {
  task: Task; employees: Employee[]; milestones: Milestone[];
  onOpenDetail: () => void; onDelete: () => void; onCycleStatus: () => void; isDragging?: boolean;
}) {
  const due = formatDueDate(task.dueDate);
  const milestone = task.milestoneId ? milestones.find(m => m.id === task.milestoneId) : null;
  const isDone = task.status === "done";
  return (
    <div style={{
      borderRadius: 7, padding: "10px 12px",
      background: "#141928", border: `1px solid ${isDragging ? "#3D7EFF" : "#1E2540"}`,
      boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
      cursor: "grab", opacity: isDragging ? 0.6 : (isDone ? 0.7 : 1),
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <p onClick={e => { e.stopPropagation(); onOpenDetail(); }}
          style={{ flex: 1, fontSize: 13, lineHeight: 1.35, color: "#E2E8F8", margin: 0, cursor: "pointer", textDecoration: isDone ? "line-through" : "none" }}>
          {task.title}
        </p>
        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ color: "#7A8BAD", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "0.4"; }}>
          <Trash2 style={{ width: 11, height: 11 }} strokeWidth={1.75} />
        </button>
      </div>
      {task.description && (
        <p style={{ marginTop: 4, fontSize: 11, color: "#7A8BAD", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {task.description}
        </p>
      )}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {/* Status chip CLICKEABLE — cycle al click */}
        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onCycleStatus(); }}
          title={`Estado: ${STATUS_LABELS[task.status]} — click para avanzar`}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 9, padding: "2px 7px", borderRadius: 3,
            background: `${STATUS_COLORS[task.status]}1F`, color: STATUS_COLORS[task.status],
            border: `1px solid ${STATUS_COLORS[task.status]}40`,
            fontFamily: "monospace", textTransform: "uppercase", cursor: "pointer",
          }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_COLORS[task.status] }} />
          {STATUS_LABELS[task.status]}
        </button>
        {task.priority && (
          <span style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 3,
            background: `${PRIORITY_COLORS[task.priority]}1F`, color: PRIORITY_COLORS[task.priority],
            border: `1px solid ${PRIORITY_COLORS[task.priority]}40`,
            fontFamily: "monospace", textTransform: "uppercase",
          }}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
        {milestone && (
          <span title={`Hito: ${milestone.title}`} style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 9, padding: "2px 6px", borderRadius: 3,
            background: `${MILESTONE_STATUS_COLORS[milestone.status]}14`, color: MILESTONE_STATUS_COLORS[milestone.status],
            border: `1px solid ${MILESTONE_STATUS_COLORS[milestone.status]}40`,
            fontFamily: "monospace", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <Flag style={{ width: 8, height: 8, flexShrink: 0 }} /> {milestone.title}
          </span>
        )}
        {due && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: due.color, fontFamily: "monospace" }}>
            <Calendar style={{ width: 9, height: 9 }} /> {due.label}
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          {(task.assigneeEmployeeId || task.assigneeName) && (
            <EmployeeAvatar employeeId={task.assigneeEmployeeId} name={task.assigneeName} employees={employees} size={20} />
          )}
        </span>
      </div>
    </div>
  );
}

function DraggableTimelineCard(props: {
  task: Task; employees: Employee[]; milestones: Milestone[];
  onOpenDetail: () => void; onDelete: () => void; onCycleStatus: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id, data: { task: props.task } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <TimelineCard {...props} isDragging={isDragging} />
    </div>
  );
}

function TimelineBucketColumn({ bucket, children }: { bucket: TimelineBucket; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bucket-${bucket}`, data: { bucket } });
  return (
    <div ref={setNodeRef} style={{
      flex: 1, minHeight: 200, display: "flex", flexDirection: "column", gap: 8, padding: 8,
      background: isOver ? "rgba(61,126,255,0.05)" : "transparent",
      border: isOver ? "1px dashed #3D7EFF66" : "1px dashed transparent",
      borderRadius: 6, transition: "background 100ms, border-color 100ms",
    }}>
      {children}
    </div>
  );
}

function TimelineBoardView({
  visibleTasks, employees, milestones, updateTask, deleteTask, openDetail, createTask, createTaskFull,
}: {
  visibleTasks: Task[]; employees: Employee[]; milestones: Milestone[];
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  openDetail: (t: Task) => void;
  createTask: (status: Status, section?: string, titleOverride?: string) => void;
  createTaskFull: (opts: { title: string; status?: Status; dueDate?: string; milestoneId?: string }) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [groupByMilestone, setGroupByMilestone] = useState(false);
  const [quickAdd, setQuickAdd] = useState<TimelineBucket | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  // Cargar el employee del current user al mount — desbloquea "Asignadas a mí"
  useEffect(() => {
    fetch("/api/employees/me").then(r => r.ok ? r.json() : null).then(data => {
      setMyEmployeeId(data?.employee?.id ?? null);
    }).catch(() => {});
  }, []);

  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weekFromNow = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() + 7); return d; }, [now]);

  const filtered = useMemo(() => {
    let arr = visibleTasks;
    if (onlyOverdue) arr = arr.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== "done");
    if (onlyMine && myEmployeeId) arr = arr.filter(t => t.assigneeEmployeeId === myEmployeeId);
    return arr;
  }, [visibleTasks, onlyOverdue, onlyMine, myEmployeeId, now]);

  const byBucket = useMemo(() => {
    const map: Record<TimelineBucket, Task[]> = { today: [], week: [], later: [] };
    filtered.forEach(t => { map[timelineCategorize(t, now, weekFromNow)].push(t); });
    // Ordenar dentro de cada bucket: atrasadas/urgentes primero
    const priorityScore = (t: Task) => {
      const pw = t.priority === "urgent" ? 4 : t.priority === "high" ? 3 : t.priority === "medium" ? 2 : 1;
      const overdueBoost = t.dueDate && new Date(t.dueDate) < now && t.status !== "done" ? 10 : 0;
      return overdueBoost + pw;
    };
    (Object.keys(map) as TimelineBucket[]).forEach(k => map[k].sort((a, b) => priorityScore(b) - priorityScore(a)));
    return map;
  }, [filtered, now, weekFromNow]);

  const onDragStart = (e: DragStartEvent) => {
    const t = filtered.find(x => x.id === e.active.id);
    if (t) setActiveTask(t);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const overData = e.over?.data.current as { bucket?: TimelineBucket };
    if (!overData?.bucket) return;
    const t = filtered.find(x => x.id === e.active.id);
    if (!t) return;
    const current = timelineCategorize(t, now, weekFromNow);
    if (current === overData.bucket) return;
    let newDue: string | undefined;
    if (overData.bucket === "today") newDue = now.toISOString();
    else if (overData.bucket === "week") {
      const target = new Date(now); target.setDate(now.getDate() + 3);
      newDue = target.toISOString();
    } else newDue = undefined; // sin fecha
    updateTask(t.id, { dueDate: newDue });
  };

  const cycleStatus = (t: Task) => updateTask(t.id, { status: NEXT_STATUS[t.status] });

  const submitQuickAdd = (bucket: TimelineBucket) => {
    if (!quickAddTitle.trim()) { setQuickAdd(null); return; }
    let dueDate: string | undefined;
    if (bucket === "today") dueDate = now.toISOString();
    else if (bucket === "week") { const t = new Date(now); t.setDate(now.getDate() + 3); dueDate = t.toISOString(); }
    // "later" → sin fecha
    createTaskFull({ title: quickAddTitle.trim(), status: "todo", dueDate });
    setQuickAddTitle(""); setQuickAdd(null);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Quick filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase" }}>Quick:</span>
          <QuickChip label="Atrasadas" active={onlyOverdue} color="#F43F5E" onClick={() => setOnlyOverdue(v => !v)} />
          <QuickChip label="Asignadas a mí" active={onlyMine} color="#3D7EFF"
            onClick={() => setOnlyMine(v => !v)} disabled={!myEmployeeId} />
          <QuickChip label="Agrupar por hito" active={groupByMilestone} color="#A855F7" onClick={() => setGroupByMilestone(v => !v)} />
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
            {filtered.length} tarea{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Las 3 columnas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {TIMELINE_BUCKETS.map(b => {
            const tasks = byBucket[b.id];
            const isAdding = quickAdd === b.id;
            return (
              <div key={b.id} style={{
                background: "#0E1220",
                border: `1px solid ${b.accent}33`,
                borderTop: `3px solid ${b.accent}`,
                borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden",
              }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #1E2540" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{b.icon}</span>
                    <h3 style={{ margin: 0, flex: 1, fontSize: 12, fontWeight: 700, color: "#E2E8F8" }}>{b.label}</h3>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: `${b.accent}1F`, color: b.accent, fontFamily: "monospace" }}>
                      {tasks.length}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0 22px", fontSize: 10, color: "#7A8BAD" }}>{b.subtitle}</p>
                </div>
                <TimelineBucketColumn bucket={b.id}>
                  {groupByMilestone ? (
                    // Agrupar las tareas del bucket por hito
                    (() => {
                      const groups = new Map<string | "none", Task[]>();
                      tasks.forEach(t => {
                        const key = t.milestoneId ?? "none";
                        const list = groups.get(key) ?? [];
                        list.push(t);
                        groups.set(key, list);
                      });
                      return Array.from(groups.entries()).map(([mid, mtasks]) => {
                        const m = mid === "none" ? null : milestones.find(x => x.id === mid);
                        return (
                          <div key={mid as string} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <p style={{ margin: "4px 4px 0", fontSize: 9, fontFamily: "monospace", color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              {m ? `▸ ${m.title}` : "▸ Sin hito"}
                            </p>
                            {mtasks.map(t => (
                              <DraggableTimelineCard key={t.id} task={t} employees={employees} milestones={milestones}
                                onOpenDetail={() => openDetail(t)} onDelete={() => deleteTask(t.id)}
                                onCycleStatus={() => cycleStatus(t)} />
                            ))}
                          </div>
                        );
                      });
                    })()
                  ) : (
                    tasks.map(t => (
                      <DraggableTimelineCard key={t.id} task={t} employees={employees} milestones={milestones}
                        onOpenDetail={() => openDetail(t)} onDelete={() => deleteTask(t.id)}
                        onCycleStatus={() => cycleStatus(t)} />
                    ))
                  )}
                  {tasks.length === 0 && !isAdding && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 8px", fontSize: 11, color: "#3A4560" }}>
                      {b.id === "today" ? "Nada urgente 🎉" : b.id === "week" ? "Despejado" : "Sin pendientes"}
                    </div>
                  )}
                </TimelineBucketColumn>
                {/* Quick add */}
                <div style={{ padding: 8, borderTop: "1px solid #1E2540" }}>
                  {isAdding ? (
                    <form onSubmit={e => { e.preventDefault(); submitQuickAdd(b.id); }} style={{ display: "flex", gap: 5 }}>
                      <input autoFocus value={quickAddTitle}
                        onChange={e => setQuickAddTitle(e.target.value)}
                        onBlur={() => { if (!quickAddTitle.trim()) setQuickAdd(null); }}
                        onKeyDown={e => { if (e.key === "Escape") setQuickAdd(null); }}
                        placeholder="Título…"
                        style={{ flex: 1, fontSize: 12, padding: "5px 9px", borderRadius: 4, background: "#141928", border: `1px solid ${b.accent}66`, color: "#E2E8F8", outline: "none" }} />
                      <button type="submit" disabled={!quickAddTitle.trim()}
                        style={{ width: 24, height: 24, borderRadius: 4, background: b.accent, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: quickAddTitle.trim() ? 1 : 0.5 }}>
                        <Plus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setQuickAdd(b.id)} style={{
                      width: "100%", padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      background: "transparent", border: "1px dashed #1E2540", borderRadius: 4,
                      color: "#7A8BAD", fontSize: 11, cursor: "pointer",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = b.accent; e.currentTarget.style.borderColor = `${b.accent}66`; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#7A8BAD"; e.currentTarget.style.borderColor = "#1E2540"; }}>
                      <Plus style={{ width: 10, height: 10 }} /> Nueva tarea
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {activeTask && <TimelineCard task={activeTask} employees={employees} milestones={milestones}
          onOpenDetail={() => {}} onDelete={() => {}} onCycleStatus={() => {}} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}

function QuickChip({ label, active, color, onClick, disabled }: {
  label: string; active: boolean; color: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      fontSize: 11, padding: "4px 10px", borderRadius: 4,
      background: active ? `${color}22` : "transparent",
      border: `1px solid ${active ? color + "66" : "#1E2540"}`,
      color: active ? color : "#7A8BAD",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em",
    }}
      title={disabled ? "Pronto" : undefined}>
      {label}
    </button>
  );
}

/* ─── Board View — DnD + section rows + status columns ─── */
function BoardView({
  createTask, updateTask, deleteTask, openDetail,
  getTasksByStatus, employees, sections, visibleTasks,
}: {
  newTaskTitle: string; setNewTaskTitle: (v: string) => void;
  createTask: (status: Status, section?: string, titleOverride?: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  openDetail: (t: Task) => void;
  getTasksByStatus: (status: Status) => Task[];
  employees: Employee[]; sections: string[]; visibleTasks: Task[];
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Input "Nueva tarea" por celda (section + status)
  const [quickInput, setQuickInput] = useState<{ section: string; status: Status; title: string } | null>(null);

  const tasksByCell = (section: string, status: Status) =>
    visibleTasks.filter(t => {
      const matchesSection = section === "Sin sección"
        ? (!t.sectionName || t.sectionName === "Sin sección")
        : t.sectionName === section;
      return matchesSection && t.status === status;
    });

  const onDragStart = (e: DragStartEvent) => {
    const t = visibleTasks.find(x => x.id === e.active.id);
    if (t) setActiveTask(t);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const overData = e.over?.data.current as { status?: Status; section?: string } | undefined;
    if (!overData?.status) return;
    const t = visibleTasks.find(x => x.id === e.active.id);
    if (!t) return;
    const updates: Partial<Task> = {};
    if (t.status !== overData.status) updates.status = overData.status;
    if (overData.section && t.sectionName !== overData.section) updates.sectionName = overData.section;
    if (Object.keys(updates).length > 0) updateTask(t.id, updates);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        {/* Header: status columns */}
        <div style={{ display: "grid", gridTemplateColumns: `180px repeat(${STATUSES.length}, 1fr)`, gap: 10, minWidth: 1000, position: "sticky", top: 0, zIndex: 5, background: "#080B12", paddingBottom: 8 }}>
          <div />
          {STATUSES.map(status => (
            <div key={status} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 12px", background: "#0E1220",
              border: "1px solid #1E2540", borderRadius: 6,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[status] }} />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F8", margin: 0, flex: 1 }}>{STATUS_LABELS[status]}</h3>
              <span style={{ borderRadius: 4, padding: "1px 6px", fontFamily: "monospace", fontSize: 10, background: "#141928", color: "#7A8BAD" }}>
                {getTasksByStatus(status).length}
              </span>
            </div>
          ))}
        </div>

        {/* Filas: una por sección */}
        {sections.map(section => (
          <div key={section} style={{ display: "grid", gridTemplateColumns: `180px repeat(${STATUSES.length}, 1fr)`, gap: 10, minWidth: 1000, marginTop: 10, alignItems: "stretch" }}>
            {/* Section header (left) */}
            <div style={{
              padding: "10px 12px", background: "#0E1220",
              border: "1px solid #1E2540", borderRadius: 6,
              display: "flex", flexDirection: "column", justifyContent: "center",
            }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(section === "Sin sección" && sections.length === 1) ? "Todas las tareas" : section}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>
                {sections.length > 1 ? visibleTasks.filter(t => (section === "Sin sección" ? (!t.sectionName || t.sectionName === "Sin sección") : t.sectionName === section)).length : visibleTasks.length} tareas
              </p>
            </div>

            {STATUSES.map(status => {
              const cellTasks = tasksByCell(section, status);
              const isAddingHere = quickInput?.section === section && quickInput.status === status;
              return (
                <div key={status} style={{ background: "#0A0E1A", border: "1px solid #1E2540", borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <DroppableColumn status={status} section={section}>
                    {cellTasks.map(task => (
                      <DraggableBoardCard key={task.id} task={task} employees={employees}
                        onOpenDetail={() => openDetail(task)} onDelete={() => deleteTask(task.id)} />
                    ))}
                    {cellTasks.length === 0 && !isAddingHere && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 8px", fontSize: 11, color: "#3A4560", border: "1px dashed #1E2540", borderRadius: 4 }}>
                        Sin tareas
                      </div>
                    )}
                  </DroppableColumn>
                  {/* Quick add input */}
                  <div style={{ padding: 6, borderTop: "1px solid #1E2540" }}>
                    {isAddingHere ? (
                      <form onSubmit={e => {
                        e.preventDefault();
                        if (!quickInput!.title.trim()) return;
                        createTask(status, section, quickInput!.title);
                        setQuickInput(null);
                      }}
                      style={{ display: "flex", gap: 5 }}>
                        <input autoFocus value={quickInput!.title}
                          onChange={e => setQuickInput({ ...quickInput!, title: e.target.value })}
                          onBlur={() => { if (!quickInput!.title.trim()) setQuickInput(null); }}
                          onKeyDown={e => { if (e.key === "Escape") setQuickInput(null); }}
                          placeholder="Título…"
                          style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 4, background: "#141928", border: "1px solid #3D7EFF", color: "#E2E8F8", outline: "none" }} />
                        <button type="submit" disabled={!quickInput!.title.trim()}
                          style={{ width: 24, height: 24, borderRadius: 4, background: "#3D7EFF", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: quickInput!.title.trim() ? 1 : 0.5 }}>
                          <Plus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
                        </button>
                      </form>
                    ) : (
                      <button onClick={() => setQuickInput({ section, status, title: "" })}
                        style={{
                          width: "100%", padding: "4px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                          background: "transparent", border: "1px dashed #1E2540", borderRadius: 4,
                          color: "#7A8BAD", fontSize: 11, cursor: "pointer",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#3D7EFF"; e.currentTarget.style.borderColor = "#3D7EFF66"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#7A8BAD"; e.currentTarget.style.borderColor = "#1E2540"; }}>
                        <Plus style={{ width: 10, height: 10 }} /> Nueva tarea
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <DragOverlay>
        {activeTask && <BoardCard task={activeTask} employees={employees} onOpenDetail={() => {}} onDelete={() => {}} isDragging={true} />}
      </DragOverlay>
    </DndContext>
  );
}

/* ─── List View ─── */
function ListView({
  sections, collapsedSections, toggleSection,
  expandedTask, setExpandedTask, detailTask, openDetail, setDetailTask,
  editingTask, setEditingTask, saveDetail, deleteTask, updateTask,
  addingTaskSection, setAddingTaskSection, inlineTaskTitle, setInlineTaskTitle,
  inlineInputRef, createTask, addingSection, setAddingSection,
  newSectionName, setNewSectionName, addSection, getTasksBySection,
  employees, selectedIds, setSelectedIds, milestones,
}: {
  sections: string[]; collapsedSections: Set<string>; toggleSection: (s: string) => void;
  expandedTask: string | null; setExpandedTask: (id: string | null) => void;
  detailTask: Task | null; openDetail: (t: Task) => void; setDetailTask: (t: Task | null) => void;
  editingTask: Partial<Task>; setEditingTask: (v: Partial<Task>) => void;
  saveDetail: () => void; deleteTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  addingTaskSection: string | null; setAddingTaskSection: (s: string | null) => void;
  inlineTaskTitle: string; setInlineTaskTitle: (v: string) => void;
  inlineInputRef: React.RefObject<HTMLInputElement | null>;
  createTask: (status: Status, section?: string) => void;
  addingSection: boolean; setAddingSection: (v: boolean) => void;
  newSectionName: string; setNewSectionName: (v: string) => void;
  addSection: () => void; getTasksBySection: (s: string) => Task[];
  employees: Employee[]; milestones: Milestone[];
  selectedIds: Set<string>; setSelectedIds: (s: Set<string>) => void;
}) {
  const colWidths = { check: "32px", done: "32px", title: "1fr", milestone: "120px", priority: "110px", assignee: "160px", due: "100px", status: "130px" };
  const grid = `${colWidths.check} ${colWidths.done} ${colWidths.title} ${colWidths.milestone} ${colWidths.priority} ${colWidths.assignee} ${colWidths.due} ${colWidths.status}`;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAllVisible = (visible: Task[]) => {
    const visibleIds = visible.map(t => t.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) visibleIds.forEach(id => next.delete(id));
    else visibleIds.forEach(id => next.add(id));
    setSelectedIds(next);
  };
  const allVisibleTasks = sections.flatMap(s => getTasksBySection(s));
  const allChecked = allVisibleTasks.length > 0 && allVisibleTasks.every(t => selectedIds.has(t.id));

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: grid, padding: "0 20px", borderBottom: "1px solid #1E2540", position: "sticky", top: 0, background: "#080B12", zIndex: 10 }}>
          <div style={{ padding: "9px 0 9px 4px", display: "flex", alignItems: "center" }}>
            <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && !allChecked; }}
              onChange={() => toggleSelectAllVisible(allVisibleTasks)}
              style={{
                cursor: "pointer", accentColor: "#3D7EFF",
                opacity: selectedIds.size > 0 ? 1 : 0.25,
                transition: "opacity 120ms ease",
              }}
              title={selectedIds.size > 0 ? "Seleccionar/deseleccionar todo" : "Tip: pasá el mouse sobre una tarea para seleccionarla"} />
          </div>
          {["", "Tarea", "Hito", "Prioridad", "Responsable", "Vencimiento", "Estado"].map((col, i) => (
            <div key={i} style={{ padding: "9px 8px", fontSize: 11, fontWeight: 600, color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</div>
          ))}
        </div>

        {sections.map(section => {
          const sectionTasks = getTasksBySection(section);
          const isCollapsed = collapsedSections.has(section);
          // Cuando "Sin sección" es el único bucket (no hay secciones custom),
          // mostramos "Todas las tareas" como label — más natural que "Sin sección".
          const displayLabel = (section === "Sin sección" && sections.length === 1) ? "Todas las tareas" : section;
          return (
            <div key={section}>
              <div onClick={() => toggleSection(section)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 20px",
                background: "#0E1220",
                borderBottom: "1px solid #1E2540",
                borderTop: "1px solid #1E2540",
                cursor: "pointer", userSelect: "none",
                marginTop: 8,
              }}>
                {isCollapsed
                  ? <ChevronRight style={{ width: 16, height: 16, color: "#7A8BAD" }} />
                  : <ChevronDown style={{ width: 16, height: 16, color: "#7A8BAD" }} />}
                <span style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F8", letterSpacing: "0.01em" }}>{displayLabel}</span>
                <span style={{ fontSize: 11, color: "#7A8BAD", background: "#141928", borderRadius: 4, padding: "2px 8px", fontFamily: "monospace" }}>
                  {sectionTasks.length} tarea{sectionTasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              {!isCollapsed && (
                <>
                  {sectionTasks.map(task => (
                    <TaskRow
                      key={task.id} task={task} grid={grid}
                      isExpanded={expandedTask === task.id}
                      onToggleExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                      onOpenDetail={() => openDetail(task)}
                      onUpdate={updates => updateTask(task.id, updates)}
                      employees={employees}
                      milestones={milestones}
                      isSelected={selectedIds.has(task.id)}
                      onToggleSelect={() => toggleSelect(task.id)}
                    />
                  ))}
                  {addingTaskSection === section ? (
                    <form
                      onSubmit={e => { e.preventDefault(); createTask("todo", section); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 20px 8px 60px",
                        background: "rgba(61,126,255,0.06)",
                        borderBottom: "1px solid #1E2540",
                        borderLeft: "3px solid #3D7EFF",
                      }}
                    >
                      <input ref={inlineInputRef} type="text" value={inlineTaskTitle}
                        onChange={e => setInlineTaskTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape") { setAddingTaskSection(null); setInlineTaskTitle(""); } }}
                        placeholder="Escribí el nombre de la tarea y presioná Enter…"
                        style={{
                          flex: 1, background: "#141928", border: "1px solid #1E2540",
                          borderRadius: 6, color: "#E2E8F8", fontSize: 13,
                          padding: "7px 12px", outline: "none",
                        }} />
                      <button type="submit" disabled={!inlineTaskTitle.trim()}
                        style={{
                          background: "#3D7EFF", color: "#fff", border: "none",
                          borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600,
                          cursor: inlineTaskTitle.trim() ? "pointer" : "not-allowed",
                          opacity: inlineTaskTitle.trim() ? 1 : 0.5,
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                        <Plus style={{ width: 13, height: 13 }} strokeWidth={2.5} />
                        Crear
                      </button>
                      <button type="button"
                        onClick={() => { setAddingTaskSection(null); setInlineTaskTitle(""); }}
                        style={{ background: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setAddingTaskSection(section)} style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "10px 20px 10px 60px",
                      background: "transparent", border: "none", borderBottom: "1px solid #1E2540",
                      color: "#7A8BAD", fontSize: 13, cursor: "pointer", textAlign: "left",
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(61,126,255,0.06)"; e.currentTarget.style.color = "#3D7EFF"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#7A8BAD"; }}>
                      <Plus style={{ width: 14, height: 14 }} strokeWidth={2.5} />
                      Agregar tarea {section === "Sin sección" && sections.length === 1 ? "" : `a "${displayLabel}"`}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        <div style={{ padding: "14px 20px" }}>
          {addingSection ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input autoFocus type="text" value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
                placeholder="Nombre de la sección…"
                style={{ background: "#0E1220", border: "1px solid #3D7EFF", color: "#E2E8F8", borderRadius: 6, padding: "6px 12px", fontSize: 13, outline: "none" }} />
              <button onClick={addSection} style={{ background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Agregar</button>
              <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} style={{ background: "transparent", color: "#7A8BAD", border: "none", cursor: "pointer" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)} style={{
              display: "flex", alignItems: "center", gap: 6, background: "transparent",
              border: "1px dashed #1E2540", borderRadius: 6, color: "#7A8BAD", fontSize: 12, padding: "7px 14px", cursor: "pointer",
            }}>
              <Plus style={{ width: 12, height: 12 }} strokeWidth={2} />
              Agregar sección
            </button>
          )}
        </div>
      </div>

      {detailTask && (
        <DetailPanel
          task={detailTask} editingTask={editingTask} setEditingTask={setEditingTask}
          onSave={saveDetail} onClose={() => setDetailTask(null)}
          onDelete={() => { deleteTask(detailTask.id); setDetailTask(null); }}
          milestones={milestones} employees={employees}
        />
      )}
    </div>
  );
}

/* ─── Task Row ─── */
function TaskRow({ task, grid, isExpanded, onToggleExpand, onOpenDetail, onUpdate, employees, milestones, isSelected, onToggleSelect }: {
  task: Task; grid: string;
  isExpanded: boolean; onToggleExpand: () => void; onOpenDetail: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  employees: Employee[]; milestones: Milestone[];
  isSelected: boolean; onToggleSelect: () => void;
}) {
  const isDone = task.status === "done";
  const dueDateInfo = formatDueDate(task.dueDate);
  const [hovered, setHovered] = useState(false);
  const [openPicker, setOpenPicker] = useState<null | "priority" | "assignee" | "status" | "due" | "milestone">(null);
  const milestone = task.milestoneId ? milestones.find(m => m.id === task.milestoneId) : null;

  return (
    <>
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid", gridTemplateColumns: grid, padding: "0 20px", borderBottom: "1px solid #1E2540",
          background: isSelected ? "rgba(61,126,255,0.08)" : (hovered ? "#0E1220" : "transparent"),
          alignItems: "center", minHeight: 38,
        }}>
        {/* Checkbox — solo visible al hover o cuando hay selección activa (patrón Linear) */}
        <div style={{ padding: "8px 0 8px 4px", display: "flex", alignItems: "center" }}>
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
            style={{
              cursor: "pointer", accentColor: "#3D7EFF",
              opacity: hovered || isSelected ? 1 : 0,
              transition: "opacity 120ms ease",
            }} />
        </div>

        {/* Done circle */}
        <div style={{ padding: "8px 8px 8px 0", display: "flex", alignItems: "center" }}>
          <button onClick={() => onUpdate({ status: isDone ? "todo" : "done" })} style={{
            width: 15, height: 15, borderRadius: "50%", border: `2px solid ${isDone ? "#10D9A0" : "#1E2540"}`,
            background: isDone ? "#10D9A0" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            {isDone && <span style={{ color: "#080B12", fontSize: 8, fontWeight: 700 }}>✓</span>}
          </button>
        </div>

        {/* Title */}
        <div onClick={onOpenDetail} onDoubleClick={onToggleExpand}
          style={{ padding: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: isDone ? "#7A8BAD" : "#E2E8F8", textDecoration: isDone ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.title}
          </span>
        </div>

        {/* Milestone inline */}
        <div style={{ padding: 8, position: "relative" }}>
          <button onClick={() => setOpenPicker(openPicker === "milestone" ? null : "milestone")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", border: "1px solid transparent", borderRadius: 4,
              padding: "3px 6px", cursor: "pointer", width: "100%", textAlign: "left",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2540"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}>
            {milestone ? (
              <>
                <Flag style={{ width: 10, height: 10, color: MILESTONE_STATUS_COLORS[milestone.status], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#C4CFEA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {milestone.title}
                </span>
              </>
            ) : <span style={{ color: "#3A4560", fontSize: 11 }}>+ Hito</span>}
          </button>
          {openPicker === "milestone" && (
            <MilestonePicker value={task.milestoneId} milestones={milestones}
              onChange={id => onUpdate({ milestoneId: id })} onClose={() => setOpenPicker(null)} />
          )}
        </div>

        {/* Priority inline */}
        <div style={{ padding: 8, position: "relative" }}>
          <button onClick={() => setOpenPicker(openPicker === "priority" ? null : "priority")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", border: "1px solid transparent", borderRadius: 4,
              padding: "3px 6px", cursor: "pointer", width: "100%",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2540"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}>
            {task.priority ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLORS[task.priority] }} />
                <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority] }}>{PRIORITY_LABELS[task.priority]}</span>
              </>
            ) : <span style={{ color: "#3A4560", fontSize: 11 }}>+ Prioridad</span>}
          </button>
          {openPicker === "priority" && (
            <InlineEnumPicker value={(task.priority ?? "medium") as Priority}
              options={["low","medium","high","urgent"] as const}
              labels={PRIORITY_LABELS} colors={PRIORITY_COLORS}
              onChange={p => onUpdate({ priority: p })} onClose={() => setOpenPicker(null)} />
          )}
        </div>

        {/* Assignee inline */}
        <div style={{ padding: 8, position: "relative" }}>
          <button onClick={() => setOpenPicker(openPicker === "assignee" ? null : "assignee")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid transparent", borderRadius: 4,
              padding: "3px 6px", cursor: "pointer", width: "100%", textAlign: "left",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2540"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}>
            {(() => {
              const emp = task.assigneeEmployeeId ? employees.find(e => e.id === task.assigneeEmployeeId) : null;
              const display = emp?.fullName ?? task.assigneeName;
              return display ? (
                <>
                  <EmployeeAvatar employeeId={task.assigneeEmployeeId} name={task.assigneeName} employees={employees} size={18} />
                  <span style={{ fontSize: 12, color: "#C4CFEA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {display}
                  </span>
                </>
              ) : <span style={{ color: "#3A4560", fontSize: 11 }}>+ Asignar</span>;
            })()}
          </button>
          {openPicker === "assignee" && (
            <EmployeePicker value={task.assigneeName} employees={employees}
              onChange={(n, id) => onUpdate({ assigneeName: n, assigneeEmployeeId: id })}
              onClose={() => setOpenPicker(null)} />
          )}
        </div>

        {/* Due date inline */}
        <div style={{ padding: 8, position: "relative" }}>
          {openPicker === "due" ? (
            <input autoFocus type="date" defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
              onChange={e => { onUpdate({ dueDate: e.target.value || undefined }); }}
              onBlur={() => setOpenPicker(null)}
              style={{ background: "#141928", border: "1px solid #3D7EFF", borderRadius: 4, color: "#E2E8F8", fontSize: 11, padding: "3px 6px", outline: "none", colorScheme: "dark", width: "100%" }} />
          ) : (
            <button onClick={() => setOpenPicker("due")}
              style={{
                background: "transparent", border: "1px solid transparent", borderRadius: 4,
                padding: "3px 6px", cursor: "pointer", width: "100%", textAlign: "left",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2540"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}>
              {dueDateInfo ? <span style={{ fontSize: 11, color: dueDateInfo.color }}>{dueDateInfo.label}</span> : <span style={{ color: "#3A4560", fontSize: 11 }}>+ Fecha</span>}
            </button>
          )}
        </div>

        {/* Status inline */}
        <div style={{ padding: 8, position: "relative" }}>
          <button onClick={() => setOpenPicker(openPicker === "status" ? null : "status")}
            style={{
              fontSize: 11, borderRadius: 4, padding: "3px 8px",
              background: `${STATUS_COLORS[task.status]}18`, color: STATUS_COLORS[task.status],
              border: `1px solid ${STATUS_COLORS[task.status]}40`, cursor: "pointer",
            }}>
            {STATUS_LABELS[task.status]}
          </button>
          {openPicker === "status" && (
            <InlineEnumPicker value={task.status} options={STATUSES} labels={STATUS_LABELS} colors={STATUS_COLORS}
              onChange={s => onUpdate({ status: s })} onClose={() => setOpenPicker(null)} />
          )}
        </div>
      </div>
      {isExpanded && (
        <div style={{ padding: "10px 20px 10px 60px", borderBottom: "1px solid #1E2540", background: "#0A0E1A" }}>
          <p style={{ fontSize: 12, color: "#7A8BAD", lineHeight: 1.6, margin: 0 }}>
            {task.description || <em>Sin descripción</em>}
          </p>
        </div>
      )}
    </>
  );
}

/* ─── Detail Panel ─── */
interface TaskComment {
  id: string; taskId: string; body: string;
  createdAt: string; updatedAt: string;
  authorUserId: string | null;
  authorClerkId?: string | null; authorFullName?: string | null; authorEmail?: string | null; authorImageUrl?: string | null;
}

interface TaskAttachment {
  id: string; taskId: string;
  fileName: string; fileUrl: string;
  fileType: string | null; fileSize: number | null;
  uploadedAt: string; uploadedByUserId: string | null;
}

function DetailPanel({ task, editingTask, setEditingTask, onSave, onClose, onDelete, milestones, employees }: {
  task: Task; editingTask: Partial<Task>; setEditingTask: (v: Partial<Task>) => void;
  onSave: () => void; onClose: () => void; onDelete: () => void;
  milestones?: Milestone[]; employees?: Employee[];
}) {
  const inp: React.CSSProperties = { width: "100%", background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#E2E8F8", outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#7A8BAD", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 };
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  // Comentarios
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [posting, setPosting] = useState(false);
  // Attachments
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`).then(r => r.ok ? r.json() : []).then(data => {
      setComments(Array.isArray(data) ? data : []);
    }).catch(() => setComments([]));
    fetch(`/api/tasks/${task.id}/attachments`).then(r => r.ok ? r.json() : []).then(data => {
      setAttachments(Array.isArray(data) ? data : []);
    }).catch(() => setAttachments([]));
  }, [task.id]);

  const uploadAttachment = async (file: File) => {
    if (uploadingFile) return;
    setUploadingFile(true);
    try {
      // 1. Subir a Storage
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "org-files");
      formData.append("name", `task-${task.id}-${Date.now()}`);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload falló");
      const { url } = await uploadRes.json();
      // 2. Registrar metadata
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileUrl: url, fileType: file.type, fileSize: file.size }),
      });
      if (res.ok) {
        const created = await res.json();
        setAttachments(prev => [created, ...prev]);
      }
    } finally { setUploadingFile(false); }
  };

  const deleteAttachment = async (attId: string) => {
    const res = await fetch(`/api/attachments/${attId}`, { method: "DELETE" });
    if (res.ok) setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const submitComment = async () => {
    if (!commentDraft.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentDraft.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        // Re-fetch para incluir author info joined
        const refreshed = await fetch(`/api/tasks/${task.id}/comments`).then(r => r.ok ? r.json() : null);
        if (Array.isArray(refreshed)) setComments(refreshed);
        else if (created) setComments(prev => [created, ...prev]);
        setCommentDraft("");
      }
    } finally { setPosting(false); }
  };

  const deleteComment = async (commentId: string) => {
    const ok = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    if (ok.ok) setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return "ahora";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };
  const selectedMilestoneId = editingTask.milestoneId !== undefined ? editingTask.milestoneId : task.milestoneId;
  const selectedMilestone = milestones?.find(m => m.id === selectedMilestoneId);
  const selectedAssigneeId = editingTask.assigneeEmployeeId !== undefined ? editingTask.assigneeEmployeeId : task.assigneeEmployeeId;
  const selectedAssigneeName = editingTask.assigneeName !== undefined ? editingTask.assigneeName : task.assigneeName;
  const selectedAssignee = selectedAssigneeId && employees ? employees.find(e => e.id === selectedAssigneeId) : null;

  return (
    <div style={{ width: 290, flexShrink: 0, borderLeft: "1px solid #1E2540", background: "#0E1220", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #1E2540" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F8" }}>Detalle</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "#F43F5E", opacity: 0.7 }}>
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A8BAD" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <div><label style={lbl}>Título</label><input type="text" value={editingTask.title ?? task.title} onChange={e => setEditingTask({ ...editingTask, title: e.target.value })} style={inp} /></div>
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><AlignLeft style={{ width: 10, height: 10 }} />Descripción</label>
          <textarea value={editingTask.description ?? task.description ?? ""} onChange={e => setEditingTask({ ...editingTask, description: e.target.value })} rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
        </div>
        <div><label style={lbl}>Estado</label>
          <select value={editingTask.status ?? task.status} onChange={e => setEditingTask({ ...editingTask, status: e.target.value as Status })} style={{ ...inp, cursor: "pointer" }}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><Flag style={{ width: 10, height: 10 }} />Prioridad</label>
          <select value={editingTask.priority ?? task.priority ?? ""} onChange={e => setEditingTask({ ...editingTask, priority: e.target.value as Priority || undefined })} style={{ ...inp, cursor: "pointer" }}>
            <option value="">Sin prioridad</option>
            {(["low","medium","high","urgent"] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </div>

        {/* Hito picker — solo si llegan milestones desde el padre */}
        {milestones !== undefined && (
          <div style={{ position: "relative" }}>
            <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><Flag style={{ width: 10, height: 10, color: "#A855F7" }} />Hito</label>
            <button onClick={() => setShowMilestonePicker(p => !p)}
              style={{ ...inp, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
              {selectedMilestone ? (
                <>
                  <Flag style={{ width: 11, height: 11, color: MILESTONE_STATUS_COLORS[selectedMilestone.status] }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedMilestone.title}</span>
                </>
              ) : <span style={{ color: "#7A8BAD" }}>Sin hito (backlog)</span>}
            </button>
            {showMilestonePicker && (
              <MilestonePicker value={selectedMilestoneId} milestones={milestones}
                onChange={id => setEditingTask({ ...editingTask, milestoneId: id })}
                onClose={() => setShowMilestonePicker(false)} />
            )}
          </div>
        )}

        <div style={{ position: "relative" }}>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><User style={{ width: 10, height: 10 }} />Responsable</label>
          {employees && employees.length > 0 ? (
            <>
              <button onClick={() => setShowAssigneePicker(p => !p)}
                style={{ ...inp, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                {selectedAssignee ? (
                  <>
                    <EmployeeAvatar employeeId={selectedAssignee.id} employees={employees} size={18} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedAssignee.fullName}</span>
                  </>
                ) : selectedAssigneeName ? (
                  <>
                    <EmployeeAvatar name={selectedAssigneeName} employees={employees} size={18} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedAssigneeName}</span>
                  </>
                ) : <span style={{ color: "#7A8BAD" }}>Sin asignar</span>}
              </button>
              {showAssigneePicker && (
                <EmployeePicker value={selectedAssigneeName ?? undefined} employees={employees}
                  onChange={(n, id) => setEditingTask({ ...editingTask, assigneeName: n, assigneeEmployeeId: id })}
                  onClose={() => setShowAssigneePicker(false)} />
              )}
            </>
          ) : (
            <input type="text" value={selectedAssigneeName ?? ""} onChange={e => setEditingTask({ ...editingTask, assigneeName: e.target.value })} placeholder="Nombre" style={inp} />
          )}
        </div>
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><Calendar style={{ width: 10, height: 10 }} />Vencimiento</label>
          <input type="date" value={editingTask.dueDate ? editingTask.dueDate.slice(0,10) : (task.dueDate ? task.dueDate.slice(0,10) : "")} onChange={e => setEditingTask({ ...editingTask, dueDate: e.target.value })} style={{ ...inp, colorScheme: "dark" }} />
        </div>

        {/* Attachments — archivos adjuntos */}
        <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid #1E2540" }}>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
            <Upload style={{ width: 10, height: 10 }} />
            Archivos {attachments.length > 0 && <span style={{ color: "#3D7EFF", fontFamily: "monospace" }}>({attachments.length})</span>}
          </label>
          <input ref={fileInputRef} type="file" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); if (fileInputRef.current) fileInputRef.current.value = ""; }} />
          {attachments.length === 0 ? (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
              style={{
                width: "100%", padding: "10px 12px",
                background: "rgba(61,126,255,0.05)", border: "1px dashed #1E2540", borderRadius: 6,
                color: "#7A8BAD", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: uploadingFile ? 0.5 : 1,
              }}>
              <Upload style={{ width: 12, height: 12 }} />
              {uploadingFile ? "Subiendo…" : "Adjuntar archivo"}
            </button>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {attachments.map(a => {
                  const isImage = a.fileType?.startsWith("image/");
                  return (
                    <div key={a.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", background: "#141928", border: "1px solid #1E2540",
                      borderRadius: 5,
                    }}>
                      {isImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={a.fileUrl} alt={a.fileName}
                          style={{ width: 30, height: 30, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 30, height: 30, borderRadius: 4, background: "#1E2540", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FileText style={{ width: 14, height: 14, color: "#7A8BAD" }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={a.fileUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#3D7EFF", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {a.fileName}
                        </a>
                        <span style={{ fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>{formatSize(a.fileSize)}</span>
                      </div>
                      <button onClick={() => deleteAttachment(a.id)}
                        style={{ background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer", padding: 2, opacity: 0.5 }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#F43F5E"; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "#7A8BAD"; }}>
                        <Trash2 style={{ width: 11, height: 11 }} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                style={{
                  marginTop: 6, width: "100%", padding: "5px 10px",
                  background: "transparent", border: "1px dashed #1E2540", borderRadius: 5,
                  color: "#7A8BAD", fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  opacity: uploadingFile ? 0.5 : 1,
                }}>
                <Plus style={{ width: 10, height: 10 }} />
                {uploadingFile ? "Subiendo…" : "Agregar archivo"}
              </button>
            </>
          )}
        </div>

        {/* Comentarios — sección de colaboración */}
        <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid #1E2540" }}>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
            <AlignLeft style={{ width: 10, height: 10 }} />
            Comentarios {comments.length > 0 && <span style={{ color: "#3D7EFF", fontFamily: "monospace" }}>({comments.length})</span>}
          </label>

          {/* Input nuevo comentario */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitComment(); } }}
              placeholder="Escribí un comentario… (Ctrl+Enter para enviar)"
              rows={2}
              style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4, fontSize: 12 }} />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={submitComment} disabled={!commentDraft.trim() || posting}
                style={{
                  background: commentDraft.trim() ? "#3D7EFF" : "#1E2540", color: "#fff",
                  border: "none", borderRadius: 4, padding: "4px 12px", fontSize: 11, fontWeight: 600,
                  cursor: commentDraft.trim() ? "pointer" : "not-allowed",
                  opacity: posting ? 0.6 : 1,
                }}>
                {posting ? "..." : "Comentar"}
              </button>
            </div>
          </div>

          {/* Lista de comentarios — más recientes primero */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.length === 0 ? (
              <p style={{ margin: 0, fontSize: 11, color: "#3A4560", fontStyle: "italic" }}>
                Sin comentarios todavía.
              </p>
            ) : comments.map(c => {
              const authorName = c.authorFullName ?? c.authorEmail ?? "?";
              const initials = authorName.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
              return (
                <div key={c.id} style={{ display: "flex", gap: 8 }}>
                  {c.authorImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.authorImageUrl} alt={authorName}
                      style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", background: "#3D7EFF",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>{initials}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#E2E8F8" }}>{authorName}</span>
                      <span style={{ fontSize: 10, color: "#7A8BAD", fontFamily: "monospace" }}>{timeAgo(c.createdAt)}</span>
                      <button onClick={() => deleteComment(c.id)}
                        title="Eliminar"
                        style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer", padding: 0, fontSize: 10, opacity: 0.5 }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#F43F5E"; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "#7A8BAD"; }}>
                        <Trash2 style={{ width: 10, height: 10 }} />
                      </button>
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#C4CFEA", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {c.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid #1E2540", marginTop: "auto", display: "flex", gap: 8 }}>
        <button onClick={onSave} style={{ flex: 1, background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, padding: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
        <button onClick={onClose} style={{ flex: 1, background: "#141928", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, padding: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}
