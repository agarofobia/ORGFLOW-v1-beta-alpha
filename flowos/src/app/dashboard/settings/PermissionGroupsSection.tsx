"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Lock,
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
};

function moduleActionCount(perms: PermissionsMap, mod: Module): number {
  const p = perms[mod];
  if (!p) return 0;
  return ACTIONS.filter((a) => p[a]).length;
}

function ModuleBadges({ modules }: { modules: PermissionsMap }) {
  const active = MODULES.filter((m) => moduleActionCount(modules, m) > 0);
  if (!active.length)
    return <span className="text-xs" style={{ color: "#7A8BAD" }}>Sin acceso a módulos</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((m) => (
        <span
          key={m}
          className="rounded px-2 py-0.5 font-mono text-[10px]"
          style={{ background: "rgba(61,126,255,0.12)", color: "#7AABFF", border: "1px solid rgba(61,126,255,0.2)" }}
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
    <div className="mt-4 overflow-hidden rounded-lg" style={{ border: "1px solid #1E2540" }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "#0A0F1C" }}>
            <th className="px-3 py-2 text-left font-mono uppercase tracking-widest" style={{ color: "#7A8BAD", width: 120 }}>
              Módulo
            </th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-2 py-2 text-center font-mono uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((mod, i) => (
            <tr
              key={mod}
              style={{ background: i % 2 === 0 ? "#0E1220" : "#0A0F1C", borderTop: "1px solid #1E2540" }}
            >
              <td className="px-3 py-2 font-medium" style={{ color: "#C4CFEA" }}>
                {MODULE_LABELS[mod]}
              </td>
              {ACTIONS.map((action) => (
                <td key={action} className="px-2 py-2 text-center">
                  <button
                    onClick={() => toggle(mod, action)}
                    className="mx-auto flex h-5 w-5 items-center justify-center rounded transition-all"
                    style={
                      modules[mod]?.[action]
                        ? { background: "#3D7EFF", color: "#fff" }
                        : { background: "#141928", border: "1px solid #1E2540", color: "#4A5568" }
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
      style={{ background: "#0E1220", border: "1px solid #1E2540" }}
    >
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: group.isPreset ? "rgba(245,158,11,0.12)" : "rgba(61,126,255,0.12)" }}>
          {group.isPreset
            ? <Lock className="h-4 w-4" style={{ color: "#F59E0B" }} />
            : <ShieldCheck className="h-4 w-4" style={{ color: "#3D7EFF" }} />
          }
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: "#E2E8F8" }}>{group.name}</span>
            {group.isPreset && (
              <span className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>
                Preset
              </span>
            )}
          </div>
          {group.description && (
            <p className="mt-0.5 text-xs truncate" style={{ color: "#7A8BAD" }}>{group.description}</p>
          )}
        </div>
        <div className="mr-2 hidden sm:block">
          <ModuleBadges modules={modules} />
        </div>
        {!group.isPreset && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
            className="rounded p-1.5 transition-colors hover:bg-red-500/10"
            style={{ color: "#7A8BAD" }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#7A8BAD" }} />
          : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#7A8BAD" }} />
        }
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4" style={{ borderColor: "#1E2540" }}>
          <ModuleEditor modules={modules} onChange={setModules} />
          {!group.isPreset && (
            <button
              onClick={save}
              disabled={saving}
              className="mt-3 rounded px-4 py-1.5 text-sm font-medium text-white transition-all"
              style={{ background: "#3D7EFF", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
          {group.isPreset && (
            <p className="mt-3 text-xs" style={{ color: "#7A8BAD" }}>
              Los grupos preset no se pueden editar directamente.
            </p>
          )}
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
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
            Sistema
          </p>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: "#E2E8F8" }}>
            Grupos de permisos
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#7A8BAD" }}>
            Definí qué puede hacer cada grupo en cada módulo y asigná empleados, departamentos o divisiones a cada grupo.
          </p>
        </div>
        <div className="flex gap-2">
          {!hasPresets && (
            <button
              onClick={seedPresets}
              disabled={seeding}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.25)" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {seeding ? "Creando…" : "Crear presets"}
            </button>
          )}
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-all"
            style={{ background: "#3D7EFF" }}
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
            style={{ background: "#141928", border: "1px solid #3D7EFF", color: "#E2E8F8" }}
          />
          <button
            onClick={createGroup}
            className="rounded px-4 py-2 text-sm font-medium text-white"
            style={{ background: "#3D7EFF" }}
          >
            Crear
          </button>
          <button
            onClick={() => setCreating(false)}
            className="rounded px-3 py-2 text-sm"
            style={{ color: "#7A8BAD", background: "#141928", border: "1px solid #1E2540" }}
          >
            Cancelar
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: "#7A8BAD" }}>Cargando grupos…</p>
      ) : groups.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: "#0E1220", border: "1px dashed #1E2540" }}
        >
          <ShieldCheck className="mx-auto mb-3 h-8 w-8" style={{ color: "#1E2540" }} />
          <p className="text-sm font-medium" style={{ color: "#C4CFEA" }}>
            No hay grupos de permisos
          </p>
          <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>
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
