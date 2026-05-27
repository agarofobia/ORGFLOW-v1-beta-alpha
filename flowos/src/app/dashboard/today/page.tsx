"use client";

// "Mi día" — vista cross-project del usuario logueado.
// Es la respuesta al "¿qué tengo que hacer hoy?" — el caso de uso #1 que faltaba.
// Lógica:
//   1. /api/employees/me devuelve el employee vinculado. Si no hay → mostrar onboarding "vincular cuenta".
//   2. /api/tasks/mine devuelve tareas asignadas, cross-project, con projectName.
//   3. Agrupamos por urgencia temporal y mostramos cards interactivas.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle, Flag, Calendar, Briefcase, UserPlus, ExternalLink } from "lucide-react";

type Status = "todo" | "in_progress" | "in_review" | "done";
type Priority = "low" | "medium" | "high" | "urgent";

interface MyTask {
  id: string; projectId: string; title: string; description?: string | null;
  status: Status; priority: Priority; dueDate?: string | null;
  milestoneId?: string | null;
  assigneeEmployeeId?: string | null;
  createdAt?: string; projectName?: string | null;
}
interface MyEmployee { id: string; fullName: string; jobTitle?: string | null; color?: string | null }

const STATUS_LABELS: Record<Status, string> = {
  todo: "Por hacer", in_progress: "En progreso", in_review: "En revisión", done: "Completado",
};
const STATUS_COLORS: Record<Status, string> = {
  todo: "var(--c-text-muted)", in_progress: "var(--c-accent-blue)", in_review: "var(--c-accent-amber)", done: "var(--c-accent-emerald)",
};
const PRIORITY_COLORS: Record<Priority, string> = {
  low: "var(--c-text-muted)", medium: "var(--c-accent-blue)", high: "var(--c-accent-amber)", urgent: "var(--c-accent-red)",
};
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente",
};
const NEXT_STATUS: Record<Status, Status> = {
  todo: "in_progress", in_progress: "in_review", in_review: "done", done: "todo",
};

type Bucket = "overdue" | "today" | "week" | "later" | "done";

function bucketize(t: MyTask, now: Date, weekEnd: Date): Bucket {
  if (t.status === "done") return "done";
  if (!t.dueDate) return "later";
  const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
  if (due < now) return "overdue";
  if (due.getTime() === now.getTime()) return "today";
  if (due < weekEnd) return "week";
  return "later";
}

const BUCKET_META: Record<Bucket, { label: string; icon: string; accent: string; subtitle: string }> = {
  overdue: { label: "Atrasadas", icon: "⚠️", accent: "var(--c-accent-red)", subtitle: "Ya pasó la fecha" },
  today: { label: "Hoy", icon: "🔥", accent: "var(--c-accent-amber)", subtitle: "Vence hoy" },
  week: { label: "Esta semana", icon: "📅", accent: "var(--c-accent-blue)", subtitle: "Próximos 7 días" },
  later: { label: "Por venir / Sin fecha", icon: "📦", accent: "var(--c-text-muted)", subtitle: "Resto del backlog" },
  done: { label: "Completadas", icon: "✓", accent: "var(--c-accent-emerald)", subtitle: "Últimas cerradas" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MyDayPage() {
  const [employee, setEmployee] = useState<MyEmployee | null>(null);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/employees/me");
      const meData = meRes.ok ? await meRes.json() : { employee: null };
      setEmployee(meData.employee ?? null);
      if (meData.employee) {
        const tasksRes = await fetch("/api/tasks/mine");
        const tasksData = tasksRes.ok ? await tasksRes.json() : { tasks: [] };
        setTasks(tasksData.tasks ?? []);
      } else {
        setTasks([]);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weekEnd = useMemo(() => { const d = new Date(now); d.setDate(now.getDate() + 7); return d; }, [now]);

  const grouped = useMemo(() => {
    const out: Record<Bucket, MyTask[]> = { overdue: [], today: [], week: [], later: [], done: [] };
    tasks.forEach(t => out[bucketize(t, now, weekEnd)].push(t));
    // ordenar por priority weight + dueDate
    const score = (t: MyTask) => {
      const pw = t.priority === "urgent" ? 4 : t.priority === "high" ? 3 : t.priority === "medium" ? 2 : 1;
      return pw;
    };
    (Object.keys(out) as Bucket[]).forEach(k => {
      out[k].sort((a, b) => {
        const sd = score(b) - score(a);
        if (sd !== 0) return sd;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    });
    return out;
  }, [tasks, now, weekEnd]);

  const cycleStatus = async (taskId: string, currentStatus: Status) => {
    const next = NEXT_STATUS[currentStatus];
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: next } : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  };

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "var(--c-bg-base)" }}>
        <Loader2 className="animate-spin" style={{ color: "var(--c-accent-blue)", width: 22, height: 22 }} />
      </div>
    );
  }

  // No vinculado todavía → onboarding
  if (!employee) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "var(--c-bg-base)", padding: 32 }}>
        <div style={{ maxWidth: 480, padding: 32, background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 12, textAlign: "center" }}>
          <UserPlus style={{ width: 44, height: 44, margin: "0 auto 14px", color: "var(--c-accent-blue)" }} strokeWidth={1.5} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--c-text-primary)" }}>
            Vinculá tu cuenta a un puesto del organigrama
          </h2>
          <p style={{ margin: "10px 0 18px", fontSize: 13, color: "var(--c-text-muted)", lineHeight: 1.6 }}>
            Para usar &quot;Mi día&quot; necesitamos saber qué posición ocupás en el orgchart.
            Andá a <strong>Empleados</strong>, encontrá tu puesto y hacé click en &quot;Soy yo&quot;.
          </p>
          <Link href="/dashboard/employees" style={{
            display: "inline-flex", alignItems: "center", gap: 6, background: "var(--c-accent-blue)", color: "#fff",
            border: "none", borderRadius: 6, padding: "10px 18px", fontSize: 13, fontWeight: 600,
            textDecoration: "none", boxShadow: "0 0 12px rgb(var(--c-accent-blue-rgb) / 0.3)",
          }}>
            Ir a Empleados <ExternalLink style={{ width: 13, height: 13 }} />
          </Link>
        </div>
      </div>
    );
  }

  const totalOpen = tasks.filter(t => t.status !== "done").length;
  const totalOverdue = grouped.overdue.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <div style={{ padding: "24px clamp(16px, 4vw, 32px) 18px", borderBottom: "1px solid var(--c-border)" }}>
        <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Workspace · {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--c-text-primary)" }}>
          Mi día — {employee.fullName.split(" ")[0]}
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--c-text-muted)" }}>
          {totalOpen} pendiente{totalOpen !== 1 ? "s" : ""}
          {totalOverdue > 0 && <span style={{ color: "var(--c-accent-red)", marginLeft: 8 }}>· {totalOverdue} atrasada{totalOverdue !== 1 ? "s" : ""}</span>}
        </p>

        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowDone(v => !v)} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: showDone ? "rgb(var(--c-accent-emerald-rgb) / 0.15)" : "transparent",
            border: `1px solid ${showDone ? "rgb(var(--c-accent-emerald-rgb) / 0.4)" : "var(--c-border)"}`,
            color: showDone ? "var(--c-accent-emerald)" : "var(--c-text-muted)",
            cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase",
          }}>
            Ver completadas
          </button>
          <Link href="/dashboard/workload" style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)",
            textDecoration: "none", fontFamily: "monospace", textTransform: "uppercase",
          }}>
            Ver carga del equipo →
          </Link>
        </div>
      </div>

      <div style={{ flex: 1, padding: "22px clamp(16px, 4vw, 32px) 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        {(["overdue", "today", "week", "later"] as Bucket[]).map(b => {
          const list = grouped[b];
          // "overdue" se oculta cuando está vacío (no quiero mostrar un bloque rojo "Atrasadas: 0" — distrae).
          // El resto (today, week, later) se muestran siempre para dar el panorama completo del día/semana.
          if (list.length === 0 && b === "overdue") return null;
          const meta = BUCKET_META[b];
          // Empty state copy específico por bucket
          const emptyCopy: Record<Bucket, string> = {
            overdue: "Sin atrasos ✓",
            today: "Nada vence hoy 🎉",
            week: "Sin nada esta semana",
            later: "Backlog vacío",
            done: "—",
          };
          return (
            <section key={b}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: meta.accent }}>
                  {meta.label}
                </h2>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--c-text-muted)" }}>
                  {list.length} · {meta.subtitle}
                </span>
              </div>
              {list.length === 0 ? (
                <div style={{ padding: "16px", background: "var(--c-bg-surface)", border: "1px dashed var(--c-border)", borderRadius: 8, fontSize: 12, color: "var(--c-text-muted)", textAlign: "center" }}>
                  {emptyCopy[b]}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map(t => (
                    <TaskCard key={t.id} task={t} onCycleStatus={() => cycleStatus(t.id, t.status)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* Completadas — al final, colapsable */}
        {showDone && grouped.done.length > 0 && (
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{BUCKET_META.done.icon}</span>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: BUCKET_META.done.accent }}>
                {BUCKET_META.done.label}
              </h2>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--c-text-muted)" }}>
                {grouped.done.length} cerradas
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped.done.map(t => (
                <TaskCard key={t.id} task={t} onCycleStatus={() => cycleStatus(t.id, t.status)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onCycleStatus }: { task: MyTask; onCycleStatus: () => void }) {
  const isDone = task.status === "done";
  const dueDate = task.dueDate ? formatDate(task.dueDate) : null;
  const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() && !isDone : false;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", background: "var(--c-bg-surface)",
      border: "1px solid var(--c-border)", borderRadius: 8,
      opacity: isDone ? 0.65 : 1,
    }}>
      {/* Status circle — click cycle */}
      <button onClick={onCycleStatus}
        title={`${STATUS_LABELS[task.status]} — click para avanzar`}
        style={{
          width: 18, height: 18, borderRadius: "50%",
          border: `2px solid ${STATUS_COLORS[task.status]}`,
          background: isDone ? STATUS_COLORS[task.status] : "transparent",
          cursor: "pointer", padding: 0, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {isDone && <span style={{ color: "var(--c-bg-base)", fontSize: 9, fontWeight: 900 }}>✓</span>}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={`/dashboard/projects?id=${task.projectId}`} style={{
            fontSize: 13, color: isDone ? "var(--c-text-muted)" : "var(--c-text-primary)",
            textDecoration: isDone ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {task.title}
          </Link>
        </div>
        <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {task.projectName && (
            <Link href={`/dashboard/projects?id=${task.projectId}`} style={{
              display: "flex", alignItems: "center", gap: 3,
              fontSize: 10, color: "var(--c-text-muted)", fontFamily: "monospace",
              textDecoration: "none",
            }}>
              <Briefcase style={{ width: 9, height: 9 }} /> {task.projectName}
            </Link>
          )}
          {task.milestoneId && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--c-accent-violet)", fontFamily: "monospace" }}>
              <Flag style={{ width: 9, height: 9 }} /> Hito
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
        {dueDate && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: isOverdue ? "var(--c-accent-red)" : "var(--c-text-muted)", fontFamily: "monospace" }}>
            {isOverdue && <AlertTriangle style={{ width: 10, height: 10 }} />}
            <Calendar style={{ width: 10, height: 10 }} /> {dueDate}
          </span>
        )}
      </div>
    </div>
  );
}
