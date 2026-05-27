"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2, Users as UsersIcon } from "lucide-react";

interface Employee { id: string; fullName: string; jobTitle?: string; color?: string; departmentId?: string | null }
interface Department { id: string; name: string; color?: string | null }
interface Task {
  id: string; projectId: string; title: string; status: "todo" | "in_progress" | "in_review" | "done";
  priority?: "low" | "medium" | "high" | "urgent"; assigneeName?: string;
  assigneeEmployeeId?: string | null; dueDate?: string;
}
interface Project { id: string; name: string }

const PRIORITY_WEIGHT: Record<NonNullable<Task["priority"]>, number> = {
  low: 1, medium: 2, high: 3, urgent: 4,
};

function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const bg = color ?? "var(--c-text-muted)";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 700, color: "#fff",
      flexShrink: 0, boxShadow: `0 0 0 1.5px ${bg}33`,
    }}>
      {initials}
    </div>
  );
}

export default function WorkloadPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // Modo de vista: por persona (default) o por departamento (agregado)
  const [groupBy, setGroupBy] = useState<"employee" | "department">("employee");

  useEffect(() => {
    (async () => {
      try {
        const [empsRes, deptsRes, projsRes] = await Promise.all([
          fetch("/api/employees"), fetch("/api/departments"), fetch("/api/projects"),
        ]);
        const emps = empsRes.ok ? await empsRes.json() : [];
        const depts = deptsRes.ok ? await deptsRes.json() : [];
        const projs = projsRes.ok ? await projsRes.json() : [];
        setEmployees(Array.isArray(emps) ? emps : []);
        setDepartments(Array.isArray(depts) ? depts : []);
        setProjects(Array.isArray(projs) ? projs : []);

        // Fetch tasks por proyecto en paralelo
        const allTasks: Task[] = [];
        await Promise.all((projs as Project[]).map(async p => {
          const r = await fetch(`/api/tasks?projectId=${p.id}`);
          if (r.ok) {
            const t = await r.json();
            if (Array.isArray(t)) allTasks.push(...t);
          }
        }));
        setTasks(allTasks);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Tasks pendientes (no done)
  const openTasks = useMemo(() => tasks.filter(t => t.status !== "done"), [tasks]);

  // Agrupar por empleado
  const byEmployee = useMemo(() => {
    const map = new Map<string, { emp: Employee; open: Task[]; overdue: Task[]; weight: number }>();
    employees.forEach(emp => map.set(emp.id, { emp, open: [], overdue: [], weight: 0 }));
    const now = new Date();
    openTasks.forEach(t => {
      // Preferir FK; fallback a name lookup para legacy
      const empId = t.assigneeEmployeeId
        ?? employees.find(e => e.fullName === t.assigneeName)?.id;
      if (!empId) return;
      const entry = map.get(empId);
      if (!entry) return;
      entry.open.push(t);
      entry.weight += t.priority ? PRIORITY_WEIGHT[t.priority] : 2;
      if (t.dueDate && new Date(t.dueDate) < now) entry.overdue.push(t);
    });
    return Array.from(map.values()).sort((a, b) => b.weight - a.weight);
  }, [employees, openTasks]);

  // Agregar por departamento
  const byDepartment = useMemo(() => {
    const map = new Map<string, { dept: Department | null; members: Employee[]; open: Task[]; overdue: Task[] }>();
    departments.forEach(d => map.set(d.id, { dept: d, members: [], open: [], overdue: [] }));
    map.set("__none__", { dept: null, members: [], open: [], overdue: [] });
    employees.forEach(emp => {
      const key = emp.departmentId ?? "__none__";
      const entry = map.get(key) ?? map.get("__none__")!;
      entry.members.push(emp);
    });
    const empById = new Map(employees.map(e => [e.id, e]));
    const now = new Date();
    openTasks.forEach(t => {
      const empId = t.assigneeEmployeeId ?? employees.find(e => e.fullName === t.assigneeName)?.id;
      if (!empId) return;
      const emp = empById.get(empId);
      if (!emp) return;
      const key = emp.departmentId ?? "__none__";
      const entry = map.get(key) ?? map.get("__none__")!;
      entry.open.push(t);
      if (t.dueDate && new Date(t.dueDate) < now) entry.overdue.push(t);
    });
    return Array.from(map.values())
      .filter(e => e.members.length > 0 || e.open.length > 0)
      .sort((a, b) => b.open.length - a.open.length);
  }, [departments, employees, openTasks]);

  // Globals
  const unassigned = openTasks.filter(t => !t.assigneeEmployeeId && !t.assigneeName).length;
  const overdueTotal = openTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
  const maxWeight = byEmployee[0]?.weight ?? 1;
  const projectsById = new Map(projects.map(p => [p.id, p]));

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "var(--c-bg-base)" }}>
        <Loader2 className="animate-spin" style={{ color: "var(--c-accent-blue)", width: 22, height: 22 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div style={{ padding: "28px clamp(16px, 4vw, 32px) 18px", borderBottom: "1px solid var(--c-border)" }}>
        <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Workspace
        </p>
        <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: "var(--c-text-primary)" }}>Carga de trabajo</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--c-text-muted)" }}>
          Tareas abiertas asignadas, agrupadas por posición del orgchart. Cross-project.
        </p>

        {/* Stats top */}
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <StatCard icon={<Activity size={14} />} label="Tareas abiertas" value={openTasks.length} color="var(--c-accent-blue)" />
          <StatCard icon={<AlertTriangle size={14} />} label="Atrasadas" value={overdueTotal} color={overdueTotal > 0 ? "var(--c-accent-red)" : "var(--c-text-muted)"} />
          <StatCard icon={<CheckCircle2 size={14} />} label="Total completadas" value={tasks.length - openTasks.length} color="var(--c-accent-emerald)" />
          <StatCard icon={<Clock size={14} />} label="Sin asignar" value={unassigned} color={unassigned > 0 ? "var(--c-accent-amber)" : "var(--c-text-muted)"} />
        </div>

        {/* Group by toggle */}
        <div style={{ marginTop: 16, display: "inline-flex", background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 6, overflow: "hidden" }}>
          {([
            { v: "employee" as const, label: "Por persona" },
            { v: "department" as const, label: "Por departamento" },
          ]).map(({ v, label }) => (
            <button key={v} onClick={() => setGroupBy(v)} style={{
              padding: "6px 14px", fontSize: 12, border: "none", cursor: "pointer",
              background: groupBy === v ? "var(--c-border)" : "transparent",
              color: groupBy === v ? "var(--c-text-primary)" : "var(--c-text-muted)",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: "20px clamp(16px, 4vw, 32px) 32px" }}>
        {groupBy === "employee" ? (
          byEmployee.filter(r => r.open.length > 0).length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {byEmployee.filter(r => r.open.length > 0).map(({ emp, open, overdue, weight }) => (
                <EmployeeWorkloadCard key={emp.id} emp={emp} open={open} overdue={overdue} weight={weight} maxWeight={maxWeight}
                  projectsById={projectsById} />
              ))}
            </div>
          )
        ) : (
          byDepartment.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
              {byDepartment.map((d, i) => (
                <DepartmentWorkloadCard key={d.dept?.id ?? "none-" + i} entry={d} employees={employees} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color }}>
        {icon}
        <p style={{ margin: 0, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", border: "1px dashed var(--c-border)", borderRadius: 12, background: "var(--c-bg-surface)" }}>
      <UsersIcon style={{ width: 36, height: 36, margin: "0 auto 10px", color: "var(--c-border)" }} />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--c-text-primary)" }}>Nada asignado</p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-muted)" }}>
        Asigná tareas a empleados del orgchart desde cualquier proyecto.
      </p>
    </div>
  );
}

function EmployeeWorkloadCard({ emp, open, overdue, weight, maxWeight, projectsById }: {
  emp: Employee; open: Task[]; overdue: Task[]; weight: number; maxWeight: number;
  projectsById: Map<string, Project>;
}) {
  const [expanded, setExpanded] = useState(false);
  const loadPct = Math.round((weight / maxWeight) * 100);
  const loadColor = overdue.length > 0 ? "var(--c-accent-red)" : loadPct > 70 ? "var(--c-accent-amber)" : "var(--c-accent-blue)";

  // Tasks agrupados por proyecto
  const byProject = open.reduce((acc, t) => {
    const list = acc.get(t.projectId) ?? [];
    list.push(t);
    acc.set(t.projectId, list);
    return acc;
  }, new Map<string, Task[]>());

  return (
    <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setExpanded(p => !p)} style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%",
        padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <Avatar name={emp.fullName} color={emp.color} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--c-text-primary)" }}>{emp.fullName}</p>
          {emp.jobTitle && <p style={{ margin: 0, fontSize: 11, color: "var(--c-text-muted)" }}>{emp.jobTitle}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 120, height: 6, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${loadPct}%`, background: loadColor, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--c-text-muted)", fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>
            {open.length} tarea{open.length !== 1 ? "s" : ""}
          </span>
          {overdue.length > 0 && (
            <span style={{
              fontSize: 10, fontFamily: "monospace", padding: "2px 7px", borderRadius: 4,
              background: "rgb(var(--c-accent-red-rgb) / 0.12)", color: "var(--c-accent-red)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.4)",
            }}>
              {overdue.length} ATRASADA{overdue.length !== 1 ? "S" : ""}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div style={{ padding: "8px 18px 16px 18px", borderTop: "1px solid var(--c-border)", background: "var(--c-bg-darkest)" }}>
          {Array.from(byProject.entries()).map(([projectId, taskList]) => {
            const proj = projectsById.get(projectId);
            return (
              <div key={projectId} style={{ marginTop: 12 }}>
                <Link href={`/dashboard/projects?id=${projectId}`} style={{ fontSize: 11, fontFamily: "monospace", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none" }}>
                  {proj?.name ?? "Proyecto"}
                </Link>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {taskList.map(t => {
                    const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();
                    return (
                      <div key={t.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 10px", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 5,
                      }}>
                        <span style={{ fontSize: 12, color: "var(--c-text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                        {t.priority && (
                          <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--c-text-muted)" }}>{t.priority.toUpperCase()}</span>
                        )}
                        {t.dueDate && (
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: isOverdue ? "var(--c-accent-red)" : "var(--c-text-muted)" }}>
                            {new Date(t.dueDate).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DepartmentWorkloadCard({ entry, employees }: {
  entry: { dept: Department | null; members: Employee[]; open: Task[]; overdue: Task[] };
  employees: Employee[];
}) {
  const name = entry.dept?.name ?? "Sin departamento";
  const color = entry.dept?.color ?? "var(--c-text-muted)";
  // Top 3 personas más cargadas del depto
  const empWorkload = entry.members.map(m => {
    const empOpen = entry.open.filter(t => {
      const empId = t.assigneeEmployeeId ?? employees.find(e => e.fullName === t.assigneeName)?.id;
      return empId === m.id;
    });
    return { emp: m, open: empOpen };
  }).filter(x => x.open.length > 0).sort((a, b) => b.open.length - a.open.length);

  return (
    <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderLeft: `3px solid ${color}`, borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--c-text-primary)" }}>{name}</p>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--c-text-muted)" }}>
          {entry.members.length} integrante{entry.members.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 14, fontSize: 11, color: "var(--c-text-muted)" }}>
        <span><strong style={{ color: "var(--c-accent-blue)", fontSize: 18 }}>{entry.open.length}</strong> abiertas</span>
        {entry.overdue.length > 0 && (
          <span><strong style={{ color: "var(--c-accent-red)", fontSize: 18 }}>{entry.overdue.length}</strong> atrasadas</span>
        )}
      </div>
      {empWorkload.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--c-border)" }}>
          <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Más cargados
          </p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {empWorkload.slice(0, 3).map(({ emp, open }) => (
              <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={emp.fullName} color={emp.color} size={20} />
                <span style={{ fontSize: 12, color: "var(--c-text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.fullName}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--c-text-muted)" }}>{open.length}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
