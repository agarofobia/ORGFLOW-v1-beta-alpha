"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Trash2, LayoutGrid, List, ChevronDown, ChevronRight,
  X, Calendar, User, Flag, AlignLeft, Settings2, Loader2,
  CheckCircle2, Circle, Clock, ArrowLeft, Folder, Users as UsersIcon,
  TrendingUp, Search,
} from "lucide-react";

const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
type Status = (typeof STATUSES)[number];
type Priority = "low" | "medium" | "high" | "urgent";
type ViewMode = "board" | "list";

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

interface Project { id: string; name: string; description?: string }
interface Task {
  id: string; projectId: string; organizationId?: string;
  title: string; description?: string; status: Status; priority?: Priority;
  assigneeName?: string; dueDate?: string; orderIndex?: number;
  sectionName?: string; createdAt?: string;
}
interface Milestone {
  id: string; title: string; description?: string;
  status: "pending" | "in_progress" | "done"; dueDate?: string; orderIndex: number;
}
interface Member {
  id: string; employeeId?: string; userId?: string; role: string;
  employee?: { fullName: string; jobTitle?: string; color?: string };
}
interface Employee { id: string; fullName: string; jobTitle?: string; color?: string }

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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
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

  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProjects(); }, []);

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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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

  const createTask = async (status: Status = "todo", sectionName?: string) => {
    const title = sectionName !== undefined ? inlineTaskTitle : newTaskTitle;
    if (!title.trim() || !selectedProject) return;
    const body: Record<string, string> = { projectId: selectedProject, title, status };
    if (sectionName !== undefined) body.sectionName = sectionName;
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const task = await res.json();
    if (task?.id) {
      setTasks(prev => [...prev, task]);
      if (sectionName !== undefined) { setInlineTaskTitle(""); setAddingTaskSection(null); }
      else setNewTaskTitle("");
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

  const getTasksByStatus = (status: Status) => tasks.filter(t => t.status === status);

  const getSections = (): string[] => {
    const sectionSet = new Set<string>(["Sin sección"]);
    tasks.forEach(t => { if (t.sectionName && t.sectionName !== "Sin sección") sectionSet.add(t.sectionName); });
    return Array.from(sectionSet);
  };

  const getTasksBySection = (section: string) =>
    tasks.filter(t => section === "Sin sección" ? !t.sectionName || t.sectionName === "Sin sección" : t.sectionName === section);

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

  // ── Hub view ─────────────────────────────────────────────────────────────
  if (!selectedProject) {
    return (
      <ProjectsHub
        projects={projects}
        addingProject={addingProject}
        setAddingProject={setAddingProject}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        createProject={createProject}
        onSelect={setSelectedProject}
      />
    );
  }

  // ── Project view ─────────────────────────────────────────────────────────
  if (!selectedProjectObj) {
    // Project no longer exists — return to hub
    setSelectedProject(null);
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080B12" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #1E2540" }}>
          <button onClick={() => setSelectedProject(null)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
            background: "transparent", border: "1px solid #1E2540", borderRadius: 6,
            color: "#7A8BAD", fontSize: 12, cursor: "pointer",
          }}>
            <ArrowLeft style={{ width: 13, height: 13 }} />
            Volver
          </button>
          <p style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "#E2E8F8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedProjectObj.name}
          </p>

          {/* View toggle */}
          <div style={{ display: "flex", background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6, overflow: "hidden" }}>
            {(["board", "list"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 12, border: "none", cursor: "pointer",
                background: viewMode === v ? "#1E2540" : "transparent",
                color: viewMode === v ? "#E2E8F8" : "#7A8BAD",
              }}>
                {v === "board" ? <LayoutGrid style={{ width: 13, height: 13 }} /> : <List style={{ width: 13, height: 13 }} />}
                {v === "board" ? "Board" : "Lista"}
              </button>
            ))}
          </div>

          {/* Detail button */}
          <button onClick={() => setShowDetail(true)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
            background: "rgba(122,139,173,0.08)", border: "1px solid #1E2540",
            borderRadius: 6, color: "#7A8BAD", fontSize: 12, cursor: "pointer",
          }}>
            <Settings2 style={{ width: 13, height: 13 }} />
            Hitos y equipo
          </button>
        </div>

        {/* Content */}
        {viewMode === "board" ? (
            <BoardView
              newTaskTitle={newTaskTitle}
              setNewTaskTitle={setNewTaskTitle}
              createTask={createTask}
              updateTaskStatus={async (id, status) => updateTask(id, { status })}
              deleteTask={deleteTask}
              getTasksByStatus={getTasksByStatus}
            />
          ) : (
            <ListView
              sections={allSections()}
              collapsedSections={collapsedSections}
              toggleSection={toggleSection}
              expandedTask={expandedTask}
              setExpandedTask={setExpandedTask}
              detailTask={detailTask}
              openDetail={openDetail}
              setDetailTask={setDetailTask}
              editingTask={editingTask}
              setEditingTask={setEditingTask}
              saveDetail={saveDetail}
              deleteTask={deleteTask}
              updateTask={updateTask}
              addingTaskSection={addingTaskSection}
              setAddingTaskSection={setAddingTaskSection}
              inlineTaskTitle={inlineTaskTitle}
              setInlineTaskTitle={setInlineTaskTitle}
              inlineInputRef={inlineInputRef}
              createTask={createTask}
              addingSection={addingSection}
              setAddingSection={setAddingSection}
              newSectionName={newSectionName}
              setNewSectionName={setNewSectionName}
              addSection={addSection}
              getTasksBySection={getTasksBySection}
            />
          )}
      </div>

      {/* Detail modal */}
      {showDetail && selectedProjectObj && (
        <ProjectDetailModal
          project={selectedProjectObj}
          onClose={() => setShowDetail(false)}
          onUpdated={updated => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))}
        />
      )}
    </div>
  );
}

/* ─── Projects Hub ─── */
function ProjectsHub({
  projects, addingProject, setAddingProject,
  newProjectName, setNewProjectName, createProject, onSelect,
}: {
  projects: Project[];
  addingProject: boolean;
  setAddingProject: (v: boolean) => void;
  newProjectName: string;
  setNewProjectName: (v: string) => void;
  createProject: () => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<Record<string, { tasks: number; done: number; members: number }>>({});

  // Fetch lightweight stats per project
  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    (async () => {
      const result: Record<string, { tasks: number; done: number; members: number }> = {};
      for (const p of projects) {
        try {
          const [tRes, mRes] = await Promise.all([
            fetch(`/api/tasks?projectId=${p.id}`),
            fetch(`/api/projects/${p.id}/members`),
          ]);
          const tasks = tRes.ok ? await tRes.json() : [];
          const members = mRes.ok ? await mRes.json() : [];
          result[p.id] = {
            tasks: Array.isArray(tasks) ? tasks.length : 0,
            done: Array.isArray(tasks) ? tasks.filter((t: { status: string }) => t.status === "done").length : 0,
            members: Array.isArray(members) ? members.length : 0,
          };
        } catch {
          result[p.id] = { tasks: 0, done: 0, members: 0 };
        }
        if (cancelled) return;
      }
      if (!cancelled) setStats(result);
    })();
    return () => { cancelled = true; };
  }, [projects]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

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
        {/* Search */}
        <div style={{ position: "relative", maxWidth: 420 }}>
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
    </div>
  );
}

/* ─── Board View ─── */
function BoardView({ newTaskTitle, setNewTaskTitle, createTask, updateTaskStatus, deleteTask, getTasksByStatus }: {
  newTaskTitle: string; setNewTaskTitle: (v: string) => void;
  createTask: (status: Status, section?: string) => void;
  updateTaskStatus: (id: string, status: Status) => void;
  deleteTask: (id: string) => void;
  getTasksByStatus: (status: Status) => Task[];
}) {
  return (
    <div style={{ flex: 1, overflowX: "auto", padding: 20 }}>
      <div style={{ display: "flex", gap: 14, minWidth: "max-content" }}>
        {STATUSES.map(status => (
          <div key={status} style={{ width: 272, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 8, background: "#0E1220", border: "1px solid #1E2540" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #1E2540" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[status] }} />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F8", margin: 0, flex: 1 }}>{STATUS_LABELS[status]}</h3>
              <span style={{ borderRadius: 4, padding: "1px 6px", fontFamily: "monospace", fontSize: 10, background: "#141928", color: "#7A8BAD" }}>
                {getTasksByStatus(status).length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", padding: 10, maxHeight: "calc(100vh - 240px)" }}>
              {getTasksByStatus(status).map(task => (
                <div key={task.id} style={{ borderRadius: 6, padding: "10px 12px", background: "#141928", border: "1px solid #1E2540" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: "#E2E8F8", margin: 0 }}>{task.title}</p>
                    <button onClick={() => deleteTask(task.id)} style={{ color: "#7A8BAD", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                      <Trash2 style={{ width: 13, height: 13 }} strokeWidth={1.75} />
                    </button>
                  </div>
                  {task.priority && (
                    <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLORS[task.priority], display: "inline-block" }} />
                      <span style={{ fontSize: 10, color: PRIORITY_COLORS[task.priority] }}>{PRIORITY_LABELS[task.priority]}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {STATUSES.filter(s => s !== status).map(s => (
                      <button key={s} onClick={() => updateTaskStatus(task.id, s)} style={{
                        borderRadius: 4, padding: "2px 6px", fontFamily: "monospace", fontSize: 9, textTransform: "uppercase",
                        background: `${STATUS_COLORS[s]}15`, border: `1px solid ${STATUS_COLORS[s]}40`, color: STATUS_COLORS[s], cursor: "pointer",
                      }}>
                        → {STATUS_LABELS[s].slice(0, 6)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {getTasksByStatus(status).length === 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", border: "1px dashed #1E2540", borderRadius: 6, fontSize: 12, color: "#7A8BAD" }}>
                  Sin tareas
                </div>
              )}
            </div>
            {status === "todo" && (
              <div style={{ padding: 10, borderTop: "1px solid #1E2540" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && createTask("todo")} placeholder="Nueva tarea…"
                    style={{ flex: 1, borderRadius: 4, padding: "6px 10px", fontSize: 12, background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8", outline: "none" }} />
                  <button onClick={() => createTask("todo")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 4, background: "#3D7EFF", color: "#fff", border: "none", cursor: "pointer" }}>
                    <Plus style={{ width: 14, height: 14 }} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
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
}) {
  const colWidths = { done: "40px", title: "1fr", priority: "90px", assignee: "130px", due: "90px", status: "120px" };
  const grid = `${colWidths.done} ${colWidths.title} ${colWidths.priority} ${colWidths.assignee} ${colWidths.due} ${colWidths.status}`;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: grid, padding: "0 20px", borderBottom: "1px solid #1E2540", position: "sticky", top: 0, background: "#080B12", zIndex: 10 }}>
          {["", "Tarea", "Prioridad", "Responsable", "Vencimiento", "Estado"].map((col, i) => (
            <div key={i} style={{ padding: "9px 8px", fontSize: 11, fontWeight: 600, color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</div>
          ))}
        </div>

        {sections.map(section => {
          const sectionTasks = getTasksBySection(section);
          const isCollapsed = collapsedSections.has(section);
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
                <span style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F8", letterSpacing: "0.01em" }}>{section}</span>
                <span style={{ fontSize: 11, color: "#7A8BAD", background: "#141928", borderRadius: 4, padding: "2px 8px", fontFamily: "monospace" }}>
                  {sectionTasks.length} tarea{sectionTasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              {!isCollapsed && (
                <>
                  {sectionTasks.map(task => (
                    <TaskRow
                      key={task.id} task={task} colWidths={colWidths} grid={grid}
                      isExpanded={expandedTask === task.id}
                      onToggleExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                      onOpenDetail={() => openDetail(task)}
                      onUpdate={updates => updateTask(task.id, updates)}
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
                      Agregar tarea a "{section}"
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
        />
      )}
    </div>
  );
}

/* ─── Task Row ─── */
function TaskRow({ task, colWidths, grid, isExpanded, onToggleExpand, onOpenDetail, onUpdate }: {
  task: Task; colWidths: Record<string, string>; grid: string;
  isExpanded: boolean; onToggleExpand: () => void; onOpenDetail: () => void;
  onUpdate: (updates: Partial<Task>) => void;
}) {
  const isDone = task.status === "done";
  const dueDateInfo = formatDueDate(task.dueDate);
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ display: "grid", gridTemplateColumns: grid, padding: "0 20px", borderBottom: "1px solid #1E2540", background: hovered ? "#0E1220" : "transparent", alignItems: "center", minHeight: 38 }}>
        <div style={{ padding: "8px 8px 8px 0", display: "flex", alignItems: "center" }}>
          <button onClick={() => onUpdate({ status: isDone ? "todo" : "done" })} style={{
            width: 15, height: 15, borderRadius: "50%", border: `2px solid ${isDone ? "#10D9A0" : "#1E2540"}`,
            background: isDone ? "#10D9A0" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            {isDone && <span style={{ color: "#080B12", fontSize: 8, fontWeight: 700 }}>✓</span>}
          </button>
        </div>
        <div onClick={onOpenDetail} onDoubleClick={onToggleExpand}
          style={{ padding: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: isDone ? "#7A8BAD" : "#E2E8F8", textDecoration: isDone ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.title}
          </span>
        </div>
        <div style={{ padding: 8, display: "flex", alignItems: "center", gap: 5 }}>
          {task.priority ? (
            <>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLORS[task.priority] }} />
              <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority] }}>{PRIORITY_LABELS[task.priority]}</span>
            </>
          ) : <span style={{ color: "#1E2540", fontSize: 11 }}>—</span>}
        </div>
        <div style={{ padding: 8, fontSize: 12, color: "#7A8BAD", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {task.assigneeName || <span style={{ color: "#1E2540" }}>—</span>}
        </div>
        <div style={{ padding: 8 }}>
          {dueDateInfo ? <span style={{ fontSize: 11, color: dueDateInfo.color }}>{dueDateInfo.label}</span> : <span style={{ color: "#1E2540", fontSize: 11 }}>—</span>}
        </div>
        <div style={{ padding: 8 }}>
          <span style={{ fontSize: 11, borderRadius: 4, padding: "2px 7px", background: `${STATUS_COLORS[task.status]}18`, color: STATUS_COLORS[task.status], border: `1px solid ${STATUS_COLORS[task.status]}40` }}>
            {STATUS_LABELS[task.status]}
          </span>
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
function DetailPanel({ task, editingTask, setEditingTask, onSave, onClose, onDelete }: {
  task: Task; editingTask: Partial<Task>; setEditingTask: (v: Partial<Task>) => void;
  onSave: () => void; onClose: () => void; onDelete: () => void;
}) {
  const inp: React.CSSProperties = { width: "100%", background: "#141928", border: "1px solid #1E2540", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#E2E8F8", outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#7A8BAD", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 };

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
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><User style={{ width: 10, height: 10 }} />Responsable</label>
          <input type="text" value={editingTask.assigneeName ?? task.assigneeName ?? ""} onChange={e => setEditingTask({ ...editingTask, assigneeName: e.target.value })} placeholder="Nombre" style={inp} />
        </div>
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><Calendar style={{ width: 10, height: 10 }} />Vencimiento</label>
          <input type="date" value={editingTask.dueDate ? editingTask.dueDate.slice(0,10) : (task.dueDate ? task.dueDate.slice(0,10) : "")} onChange={e => setEditingTask({ ...editingTask, dueDate: e.target.value })} style={{ ...inp, colorScheme: "dark" }} />
        </div>
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid #1E2540", marginTop: "auto", display: "flex", gap: 8 }}>
        <button onClick={onSave} style={{ flex: 1, background: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, padding: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
        <button onClick={onClose} style={{ flex: 1, background: "#141928", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, padding: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}
