"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Check, Circle, CheckCircle2, Trash2,
  Users, Flag, Calendar, ChevronDown, FileText, Upload, Download,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: string; name: string; description: string | null; createdAt: string; }
interface Milestone {
  id: string; title: string; description: string | null;
  status: "pending" | "in_progress" | "done";
  orderIndex: number; dueDate: string | null;
}
interface Member {
  id: string; employeeId: string | null; role: string;
  fullName: string | null; jobTitle: string | null; color: string | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const MILESTONE_STATUS_COLORS = {
  pending: "#7A8BAD",
  in_progress: "#3D7EFF",
  done: "#10D9A0",
};
const MILESTONE_STATUS_LABELS = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Completo",
};

function Avatar({ name, color, size = 32 }: { name: string | null; color: string | null; size?: number }) {
  const initials = (name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: color ?? "#3D7EFF", fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// ─── Milestones tab ───────────────────────────────────────────────────────────

function MilestonesTab({ projectId }: { projectId: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`);
      if (res.ok) setMilestones(await res.json());
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const cycleStatus = async (m: Milestone) => {
    const next = m.status === "pending" ? "in_progress" : m.status === "in_progress" ? "done" : "pending";
    await fetch(`/api/projects/${projectId}/milestones/${m.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
  };

  const createMilestone = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      const m = await res.json();
      setMilestones((prev) => [...prev, m]);
      setNewTitle("");
      setAdding(false);
    }
  };

  const deleteMilestone = async (id: string) => {
    await fetch(`/api/projects/${projectId}/milestones/${id}`, { method: "DELETE" });
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  if (loading) return <p className="py-12 text-center text-sm" style={{ color: "#7A8BAD" }}>Cargando…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "#7A8BAD" }}>
          {milestones.length} hitos · {milestones.filter((m) => m.status === "done").length} completados
        </p>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: "#3D7EFF" }}
        >
          <Plus className="h-3.5 w-3.5" /> Agregar hito
        </button>
      </div>

      {adding && (
        <div className="mb-4 flex gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createMilestone(); if (e.key === "Escape") setAdding(false); }}
            placeholder="Nombre del hito…"
            className="flex-1 rounded px-3 py-2 text-sm outline-none"
            style={{ background: "#141928", border: "1px solid #3D7EFF", color: "#E2E8F8" }}
          />
          <button onClick={createMilestone} className="rounded px-4 py-2 text-sm font-medium text-white" style={{ background: "#3D7EFF" }}>Crear</button>
          <button onClick={() => setAdding(false)} className="rounded px-3 py-2 text-sm" style={{ color: "#7A8BAD", background: "#141928", border: "1px solid #1E2540" }}>✕</button>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="rounded-lg p-10 text-center" style={{ background: "#0E1220", border: "1px dashed #1E2540" }}>
          <Flag className="mx-auto mb-3 h-8 w-8" style={{ color: "#1E2540" }} />
          <p className="text-sm" style={{ color: "#C4CFEA" }}>Sin hitos todavía</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {milestones.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{ background: "#0E1220", border: "1px solid #1E2540" }}>
              <span className="font-mono text-xs w-5 text-right" style={{ color: "#4A5568" }}>{i + 1}</span>
              <button onClick={() => cycleStatus(m)} className="shrink-0">
                {m.status === "done"
                  ? <CheckCircle2 className="h-5 w-5" style={{ color: "#10D9A0" }} />
                  : m.status === "in_progress"
                  ? <Circle className="h-5 w-5" style={{ color: "#3D7EFF" }} />
                  : <Circle className="h-5 w-5" style={{ color: "#4A5568" }} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: m.status === "done" ? "#7A8BAD" : "#E2E8F8",
                  textDecoration: m.status === "done" ? "line-through" : "none" }}>
                  {m.title}
                </p>
                {m.dueDate && (
                  <p className="mt-0.5 text-xs" style={{ color: "#7A8BAD" }}>
                    <Calendar className="inline h-3 w-3 mr-1" />
                    {new Date(m.dueDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                  </p>
                )}
              </div>
              <span className="rounded px-2 py-0.5 font-mono text-[10px]"
                style={{ background: `${MILESTONE_STATUS_COLORS[m.status]}18`, color: MILESTONE_STATUS_COLORS[m.status], border: `1px solid ${MILESTONE_STATUS_COLORS[m.status]}30` }}>
                {MILESTONE_STATUS_LABELS[m.status]}
              </span>
              <button onClick={() => deleteMilestone(m.id)} className="rounded p-1 hover:bg-red-500/10" style={{ color: "#4A5568" }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Members tab ──────────────────────────────────────────────────────────────

function MembersTab({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; jobTitle: string | null; color: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [membRes, empRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`),
        fetch("/api/employees"),
      ]);
      if (membRes.ok) setMembers(await membRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const addMember = async () => {
    if (!selectedEmployee) return;
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: selectedEmployee, role: selectedRole }),
    });
    if (res.ok) {
      await load();
      setSelectedEmployee("");
    }
  };

  const removeMember = async (memberId: string) => {
    await fetch(`/api/projects/${projectId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const memberEmployeeIds = new Set(members.map((m) => m.employeeId));
  const availableEmployees = employees.filter((e) => !memberEmployeeIds.has(e.id));

  if (loading) return <p className="py-12 text-center text-sm" style={{ color: "#7A8BAD" }}>Cargando…</p>;

  return (
    <div>
      {/* Add member */}
      <div className="mb-6 flex gap-2">
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          className="flex-1 rounded px-3 py-2 text-sm outline-none"
          style={{ background: "#141928", border: "1px solid #1E2540", color: selectedEmployee ? "#E2E8F8" : "#7A8BAD" }}
        >
          <option value="">Seleccionar empleado…</option>
          {availableEmployees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName}{e.jobTitle ? ` — ${e.jobTitle}` : ""}</option>
          ))}
        </select>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="rounded px-3 py-2 text-sm outline-none"
          style={{ background: "#141928", border: "1px solid #1E2540", color: "#C4CFEA" }}
        >
          <option value="owner">Owner</option>
          <option value="member">Miembro</option>
          <option value="viewer">Solo lectura</option>
        </select>
        <button
          onClick={addMember}
          disabled={!selectedEmployee}
          className="flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          style={{ background: "#3D7EFF" }}
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg p-10 text-center" style={{ background: "#0E1220", border: "1px dashed #1E2540" }}>
          <Users className="mx-auto mb-3 h-8 w-8" style={{ color: "#1E2540" }} />
          <p className="text-sm" style={{ color: "#C4CFEA" }}>Sin miembros asignados</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{ background: "#0E1220", border: "1px solid #1E2540" }}>
              <Avatar name={m.fullName} color={m.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>{m.fullName ?? "Sin nombre"}</p>
                {m.jobTitle && <p className="text-xs" style={{ color: "#7A8BAD" }}>{m.jobTitle}</p>}
              </div>
              <span className="rounded px-2 py-0.5 font-mono text-[10px] capitalize"
                style={{ background: "#141928", color: "#7A8BAD", border: "1px solid #1E2540" }}>
                {m.role}
              </span>
              <button onClick={() => removeMember(m.id)} className="rounded p-1 hover:bg-red-500/10" style={{ color: "#4A5568" }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Files tab ────────────────────────────────────────────────────────────────

interface ProjectFileRow {
  linkId: string;
  addedAt: string;
  id: string;
  title: string;
  content: { type: string; fileType: string; size: number; storageUrl?: string; data?: string };
  createdAt: string;
}

function FilesTab({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (res.ok) setFiles(await res.json());
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "org-files");

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url: storageUrl } = await uploadRes.json();

      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name, fileType: file.type, size: file.size, storageUrl }),
      });
      if (res.ok) { const newFile = await res.json(); setFiles((prev) => [newFile, ...prev]); }
    } catch {
      // silent — user sees no spinner change
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [projectId]);

  const deleteFile = async (linkId: string, documentId: string) => {
    await fetch(`/api/projects/${projectId}/files`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, documentId }),
    });
    setFiles((prev) => prev.filter((f) => f.linkId !== linkId));
  };

  const downloadFile = (file: ProjectFileRow) => {
    const a = document.createElement("a");
    a.href = file.content.storageUrl ?? file.content.data ?? "";
    a.download = file.title;
    a.target = "_blank";
    a.click();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <p className="py-12 text-center text-sm" style={{ color: "#7A8BAD" }}>Cargando…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "#7A8BAD" }}>{files.length} archivo{files.length !== 1 ? "s" : ""}</p>
        <label
          className="flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: uploading ? "#2A3356" : "#3D7EFF" }}
        >
          {uploading ? (
            <>
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" /> Subir archivo
            </>
          )}
          <input type="file" className="sr-only" onChange={handleFileSelect} disabled={uploading} />
        </label>
      </div>

      {files.length === 0 ? (
        <div className="rounded-lg p-10 text-center" style={{ background: "#0E1220", border: "1px dashed #1E2540" }}>
          <FileText className="mx-auto mb-3 h-8 w-8" style={{ color: "#1E2540" }} />
          <p className="text-sm" style={{ color: "#C4CFEA" }}>Sin archivos adjuntos</p>
          <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>Subí archivos para vincularlos a este proyecto</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((f) => {
            const isImage = f.content?.fileType?.startsWith("image/");
            return (
              <div key={f.linkId} className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "#0E1220", border: "1px solid #1E2540" }}>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.content.data} alt={f.title} className="h-10 w-10 rounded object-cover shrink-0"
                    style={{ border: "1px solid #1E2540" }} />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded"
                    style={{ background: "#141928", border: "1px solid #1E2540" }}>
                    <FileText className="h-5 w-5" style={{ color: "#7A8BAD" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#E2E8F8" }}>{f.title}</p>
                  <p className="text-xs" style={{ color: "#7A8BAD" }}>
                    {f.content?.fileType ?? "file"} · {formatSize(f.content?.size ?? 0)} · {new Date(f.addedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                  </p>
                </div>
                <button onClick={() => downloadFile(f)} className="rounded p-1.5 hover:bg-blue-500/10 transition-colors" style={{ color: "#7A8BAD" }} title="Descargar">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => deleteFile(f.linkId, f.id)} className="rounded p-1.5 hover:bg-red-500/10 transition-colors" style={{ color: "#4A5568" }} title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "milestones" | "members" | "files";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("milestones");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) { setProject(data); setNameInput(data.name); }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const saveName = async () => {
    if (!nameInput.trim() || !project) return;
    await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    setProject((p) => p ? { ...p, name: nameInput.trim() } : p);
    setEditingName(false);
  };

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "milestones", label: "Hitos", icon: <Flag className="h-3.5 w-3.5" /> },
    { key: "members", label: "Miembros", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "files", label: "Archivos", icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm" style={{ color: "#7A8BAD" }}>Cargando proyecto…</p>
    </div>
  );
  if (!project) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm" style={{ color: "#F43F5E" }}>Proyecto no encontrado.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard/projects")}
        className="mb-6 flex items-center gap-2 text-sm transition-colors hover:opacity-80"
        style={{ color: "#7A8BAD" }}
      >
        <ArrowLeft className="h-4 w-4" /> Volver a proyectos
      </button>

      {/* Header */}
      <div className="mb-8">
        {editingName ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              className="flex-1 rounded px-3 py-2 text-xl font-bold outline-none"
              style={{ background: "#141928", border: "1px solid #3D7EFF", color: "#E2E8F8" }}
            />
            <button onClick={saveName} className="rounded px-4 py-2 text-sm font-medium text-white" style={{ background: "#3D7EFF" }}>
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <h1
            className="cursor-pointer text-2xl font-bold transition-opacity hover:opacity-80"
            style={{ color: "#E2E8F8" }}
            onClick={() => setEditingName(true)}
            title="Click para editar"
          >
            {project.name}
          </h1>
        )}
        <p className="mt-1 text-xs" style={{ color: "#4A5568" }}>
          Creado {new Date(project.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg p-1" style={{ background: "#0A0F1C", border: "1px solid #1E2540" }}>
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex flex-1 items-center justify-center gap-2 rounded py-2 text-sm font-medium transition-all"
            style={
              tab === key
                ? { background: "#141928", color: "#E2E8F8", border: "1px solid #1E2540" }
                : { color: "#7A8BAD" }
            }
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "milestones" && <MilestonesTab projectId={id} />}
      {tab === "members" && <MembersTab projectId={id} />}
      {tab === "files" && <FilesTab projectId={id} />}
    </div>
  );
}
