"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Lock,
  UserCircle2,
  GitBranch,
  Search,
  X,
  Users as UsersIcon,
} from "lucide-react";
import { MODULES, ACTIONS, Module, Action, PermissionsMap } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PermissionGroup {
  id: string;
  name: string;
  description: string | null;
  modules: PermissionsMap;
  isPreset: boolean;
  createdAt: string;
}

type SubjectType = "employee" | "department" | "division";

interface Assignment {
  id: string;
  subjectType: SubjectType | "user";
  subjectId: string;
  displayName: string;
}

interface Subject {
  id: string;
  name: string;
}

const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  employee: "Empleado",
  department: "Departamento",
  division: "División",
};

const SUBJECT_TYPE_ICONS: Record<SubjectType, typeof UserCircle2> = {
  employee: UserCircle2,
  department: GitBranch,
  division: UsersIcon,
};

// ─── Helper: badge for a module ───────────────────────────────────────────────

const MODULE_LABELS: Record<Module, string> = {
  employees: "Empleados",
  org_chart: "Org Chart",
  projects: "Proyectos",
  documents: "Documentos",
  processes: "Procesos",
  inbox: "Inbox",
  settings: "Config",
  reports: "Reportes",
  ai: "Asistente IA",
};

function moduleActionCount(perms: PermissionsMap, mod: Module): number {
  const p = perms[mod];
  if (!p) return 0;
  return ACTIONS.filter((a) => p[a]).length;
}

function ModuleBadges({ modules }: { modules: PermissionsMap }) {
  const active = MODULES.filter((m) => moduleActionCount(modules, m) > 0);
  if (!active.length)
    return <span className="text-xs" style={{ color: "var(--c-text-muted)" }}>Sin acceso a módulos</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((m) => (
        <span
          key={m}
          className="rounded px-2 py-0.5 font-mono text-[10px]"
          style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.12)", color: "#7AABFF", border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.2)" }}
        >
          {MODULE_LABELS[m]} ({moduleActionCount(modules, m)})
        </span>
      ))}
    </div>
  );
}

// ─── Module permission editor ─────────────────────────────────────────────────

function ModuleEditor({
  modules,
  onChange,
}: {
  modules: PermissionsMap;
  onChange: (m: PermissionsMap) => void;
}) {
  const toggle = (mod: Module, action: Action) => {
    const current = modules[mod]?.[action] ?? false;
    const modPerms = { ...(modules[mod] ?? {}) };
    if (current) {
      delete modPerms[action];
    } else {
      modPerms[action] = true;
    }
    onChange({ ...modules, [mod]: modPerms });
  };

  return (
    <div className="mt-4 overflow-hidden rounded-lg" style={{ border: "1px solid var(--c-border)" }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "var(--c-bg-darker)" }}>
            <th className="px-3 py-2 text-left font-mono uppercase tracking-widest" style={{ color: "var(--c-text-muted)", width: 120 }}>
              Módulo
            </th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-2 py-2 text-center font-mono uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((mod, i) => (
            <tr
              key={mod}
              style={{ background: i % 2 === 0 ? "var(--c-bg-surface)" : "var(--c-bg-darker)", borderTop: "1px solid var(--c-border)" }}
            >
              <td className="px-3 py-2 font-medium" style={{ color: "var(--c-text-secondary)" }}>
                {MODULE_LABELS[mod]}
              </td>
              {ACTIONS.map((action) => (
                <td key={action} className="px-2 py-2 text-center">
                  <button
                    onClick={() => toggle(mod, action)}
                    className="mx-auto flex h-5 w-5 items-center justify-center rounded transition-all"
                    style={
                      modules[mod]?.[action]
                        ? { background: "var(--c-accent-blue)", color: "#fff" }
                        : { background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-dim)" }
                    }
                  >
                    {modules[mod]?.[action] && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Assignment picker modal ──────────────────────────────────────────────────
// Lista empleados/deptos/divisiones de la org, permite filtrar y crear assignment.

function AssignmentPickerModal({
  groupId,
  groupName,
  existing,
  onClose,
  onAssigned,
}: {
  groupId: string;
  groupName: string;
  existing: Set<string>; // claves "type:id" ya asignadas
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [type, setType] = useState<SubjectType>("employee");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const url =
      type === "employee" ? "/api/employees" :
      type === "department" ? "/api/departments" :
      "/api/divisions";
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ id: string; fullName?: string; name?: string }>) => {
        const list: Subject[] = Array.isArray(data)
          ? data.map(x => ({ id: x.id, name: x.fullName ?? x.name ?? "—" }))
          : [];
        setSubjects(list);
      })
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, [type]);

  // Cerrar con Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(s => s.name.toLowerCase().includes(q));
  }, [subjects, query]);

  const assign = async (subjectId: string) => {
    setAssigning(subjectId);
    try {
      const res = await fetch(`/api/permission-groups/${groupId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectType: type, subjectId }),
      });
      if (res.ok) onAssigned();
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "var(--c-shadow-strong)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "clamp(12px, 4vh, 32px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--c-bg-surface)", border: "1px solid var(--c-border)",
          borderRadius: 12, width: "100%", maxWidth: 520,
          maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldCheck size={16} style={{ color: "var(--c-accent-blue)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>
              Asignar a grupo
            </p>
            <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "2px 0 0", fontFamily: "monospace" }}>
              {groupName}
            </p>
          </div>
          <button onClick={onClose} title="Cerrar" aria-label="Cerrar"
            style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Type selector */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--c-border)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["employee", "department", "division"] as const).map(t => {
              const Icon = SUBJECT_TYPE_ICONS[t];
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                    background: active ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-elevated)",
                    border: active ? "1px solid rgb(var(--c-accent-blue-rgb) / 0.4)" : "1px solid var(--c-border)",
                    color: active ? "var(--c-accent-blue)" : "var(--c-text-muted)",
                  }}
                >
                  <Icon size={12} />
                  {SUBJECT_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--c-text-muted)" }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar ${SUBJECT_TYPE_LABELS[type].toLowerCase()}…`}
              style={{
                width: "100%", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)",
                borderRadius: 6, padding: "7px 10px 7px 28px", fontSize: 12,
                color: "var(--c-text-primary)", outline: "none",
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {loading ? (
            <p style={{ textAlign: "center", padding: 24, color: "var(--c-text-muted)", fontSize: 12 }}>
              Cargando…
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: "center", padding: 24, color: "var(--c-text-muted)", fontSize: 12 }}>
              {query ? "Sin resultados" : "Sin elementos en la org"}
            </p>
          ) : (
            filtered.map(s => {
              const key = `${type}:${s.id}`;
              const already = existing.has(key);
              const isBusy = assigning === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => !already && !isBusy && assign(s.id)}
                  disabled={already || isBusy}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", marginBottom: 2, borderRadius: 6,
                    background: already ? "var(--c-bg-base)" : "transparent",
                    border: "1px solid transparent", textAlign: "left",
                    cursor: already || isBusy ? "default" : "pointer",
                    opacity: already ? 0.5 : 1,
                    color: "var(--c-text-secondary)", fontSize: 12,
                  }}
                  onMouseEnter={e => { if (!already && !isBusy) e.currentTarget.style.background = "var(--c-bg-elevated)"; }}
                  onMouseLeave={e => { if (!already) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1 }}>{s.name}</span>
                  {already && (
                    <span style={{ fontSize: 10, color: "var(--c-accent-emerald)", fontFamily: "monospace" }}>
                      ✓ asignado
                    </span>
                  )}
                  {isBusy && (
                    <span style={{ fontSize: 10, color: "var(--c-text-muted)", fontFamily: "monospace" }}>
                      …
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Assignments section dentro del grupo ─────────────────────────────────────

function AssignmentsBlock({
  groupId,
  groupName,
  isPreset,
}: {
  groupId: string;
  groupName: string;
  isPreset: boolean;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/permission-groups/${groupId}/assignments`);
      if (r.ok) setAssignments(await r.json());
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (a: Assignment) => {
    await fetch(`/api/permission-groups/${groupId}/assignments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectType: a.subjectType, subjectId: a.subjectId }),
    });
    setAssignments(prev => prev.filter(x => x.id !== a.id));
  };

  const existing = useMemo(
    () => new Set(assignments.map(a => `${a.subjectType}:${a.subjectId}`)),
    [assignments]
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, fontFamily: "monospace" }}>
          Asignado a · {assignments.length}
        </p>
        <button
          onClick={() => setPickerOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
            background: "rgb(var(--c-accent-blue-rgb) / 0.12)",
            border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.3)",
            color: "var(--c-accent-blue)",
          }}
        >
          <Plus size={11} />
          Asignar
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 11, color: "var(--c-text-muted)", padding: 8 }}>Cargando…</p>
      ) : assignments.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--c-text-muted)", padding: "8px 0", fontStyle: "italic" }}>
          Sin asignaciones — este grupo no afecta a nadie todavía.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {assignments.map(a => {
            const Icon = a.subjectType === "employee" ? UserCircle2
              : a.subjectType === "department" ? GitBranch
              : a.subjectType === "division" ? UsersIcon
              : UserCircle2;
            return (
              <div
                key={a.id}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)",
                  borderRadius: 14, padding: "4px 4px 4px 10px",
                  fontSize: 11, color: "var(--c-text-secondary)",
                }}
              >
                <Icon size={11} style={{ color: "var(--c-text-muted)" }} />
                <span>{a.displayName}</span>
                <button
                  onClick={() => remove(a)}
                  title="Quitar asignación"
                  aria-label="Quitar asignación"
                  style={{
                    background: "transparent", border: "none",
                    color: "var(--c-text-muted)", cursor: "pointer", padding: 2,
                    display: "flex", alignItems: "center", borderRadius: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--c-accent-red)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--c-text-muted)"; }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isPreset && (
        <p style={{ fontSize: 10, color: "var(--c-text-muted)", marginTop: 8, fontStyle: "italic" }}>
          Tip: los presets se pueden asignar pero no editar. Si necesitás otros permisos, creá un grupo custom.
        </p>
      )}

      {pickerOpen && (
        <AssignmentPickerModal
          groupId={groupId}
          groupName={groupName}
          existing={existing}
          onClose={() => setPickerOpen(false)}
          onAssigned={() => { load(); }}
        />
      )}
    </div>
  );
}

// ─── Single group row ─────────────────────────────────────────────────────────

function GroupRow({
  group,
  onDelete,
  onUpdate,
}: {
  group: PermissionGroup;
  onDelete: (id: string) => void;
  onUpdate: (id: string, modules: PermissionsMap) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [modules, setModules] = useState<PermissionsMap>(group.modules ?? {});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/permission-groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules }),
      });
      onUpdate(group.id, modules);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-lg transition-all"
      style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
    >
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: group.isPreset ? "rgb(var(--c-accent-amber-rgb) / 0.12)" : "rgb(var(--c-accent-blue-rgb) / 0.12)" }}>
          {group.isPreset
            ? <Lock className="h-4 w-4" style={{ color: "var(--c-accent-amber)" }} />
            : <ShieldCheck className="h-4 w-4" style={{ color: "var(--c-accent-blue)" }} />
          }
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: "var(--c-text-primary)" }}>{group.name}</span>
            {group.isPreset && (
              <span className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.12)", color: "var(--c-accent-amber)", border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.2)" }}>
                Preset
              </span>
            )}
          </div>
          {group.description && (
            <p className="mt-0.5 text-xs truncate" style={{ color: "var(--c-text-muted)" }}>{group.description}</p>
          )}
        </div>
        <div className="mr-2 hidden sm:block">
          <ModuleBadges modules={modules} />
        </div>
        {!group.isPreset && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
            className="rounded p-1.5 transition-colors hover:bg-red-500/10"
            style={{ color: "var(--c-text-muted)" }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--c-text-muted)" }} />
          : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--c-text-muted)" }} />
        }
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4" style={{ borderColor: "var(--c-border)" }}>
          <ModuleEditor modules={modules} onChange={setModules} />
          {!group.isPreset && (
            <button
              onClick={save}
              disabled={saving}
              className="mt-3 rounded px-4 py-1.5 text-sm font-medium text-white transition-all"
              style={{ background: "var(--c-accent-blue)", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
          {group.isPreset && (
            <p className="mt-3 text-xs" style={{ color: "var(--c-text-muted)" }}>
              Los grupos preset no se pueden editar directamente. Para permisos custom, creá un grupo nuevo.
            </p>
          )}
          <AssignmentsBlock
            groupId={group.id}
            groupName={group.name}
            isPreset={group.isPreset}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main section component ───────────────────────────────────────────────────

export default function PermissionGroupsSection() {
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/permission-groups");
      if (res.ok) setGroups(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedPresets = async () => {
    setSeeding(true);
    try {
      await fetch("/api/permission-groups/seed-presets", { method: "POST" });
      await load();
    } finally {
      setSeeding(false);
    }
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    await fetch("/api/permission-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), modules: {} }),
    });
    setNewName("");
    setCreating(false);
    await load();
  };

  const deleteGroup = async (id: string) => {
    await fetch(`/api/permission-groups/${id}`, { method: "DELETE" });
    setGroups((g) => g.filter((x) => x.id !== id));
  };

  const updateGroup = (id: string, modules: PermissionsMap) => {
    setGroups((g) => g.map((x) => (x.id === id ? { ...x, modules } : x)));
  };

  const hasPresets = groups.some((g) => g.isPreset);

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
            Sistema
          </p>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--c-text-primary)" }}>
            Grupos de permisos
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--c-text-muted)" }}>
            Definí qué puede hacer cada grupo en cada módulo y asigná empleados, departamentos o divisiones a cada grupo.
          </p>
        </div>
        <div className="flex gap-2">
          {!hasPresets && (
            <button
              onClick={seedPresets}
              disabled={seeding}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.12)", color: "var(--c-accent-amber)", border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.25)" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {seeding ? "Creando…" : "Crear presets"}
            </button>
          )}
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-all"
            style={{ background: "var(--c-accent-blue)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo grupo
          </button>
        </div>
      </div>

      {/* New group form */}
      {creating && (
        <div className="mb-4 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createGroup(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Nombre del grupo…"
            className="flex-1 rounded px-3 py-2 text-sm outline-none"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-accent-blue)", color: "var(--c-text-primary)" }}
          />
          <button
            onClick={createGroup}
            className="rounded px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--c-accent-blue)" }}
          >
            Crear
          </button>
          <button
            onClick={() => setCreating(false)}
            className="rounded px-3 py-2 text-sm"
            style={{ color: "var(--c-text-muted)", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}
          >
            Cancelar
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: "var(--c-text-muted)" }}>Cargando grupos…</p>
      ) : groups.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: "var(--c-bg-surface)", border: "1px dashed var(--c-border)" }}
        >
          <ShieldCheck className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--c-border)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--c-text-secondary)" }}>
            No hay grupos de permisos
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--c-text-muted)" }}>
            Creá los presets para empezar rápido o definí grupos personalizados.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              onDelete={deleteGroup}
              onUpdate={updateGroup}
            />
          ))}
        </div>
      )}
    </section>
  );
}
