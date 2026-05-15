"use client";

import { useMemo, useRef, useState } from "react";
import {
  X, Loader2, UserPlus, FolderPlus, Layers, Edit3, Trash2, Sparkles, Search,
  ChevronDown, ChevronRight,
} from "lucide-react";
import type { Employee } from "@/db/schema";
import type { Division, Department } from "./types";
import { COLORS } from "./constants";

// ─── Add Position panel (toolbar quick-add) ──────────────────────────────────

export function AddPositionPanel({ onAdd, onClose }: {
  onAdd: (jobTitle: string, fullName: string, color: string) => Promise<void>;
  onClose: () => void;
}) {
  const [jobTitle, setJobTitle] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const colorRef = useRef<string>(COLORS[Math.floor(Math.random() * COLORS.length)]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim()) return;
    setSaving(true);
    try {
      await onAdd(jobTitle.trim(), fullName.trim() || jobTitle.trim(), colorRef.current);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ width: 260, background: "#0E1220", border: "1px solid #1E2540", borderRadius: 8, padding: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>Nuevo puesto</p>
        <button onClick={onClose} className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <input autoFocus value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Puesto"
          className="rounded px-3 py-2 text-sm outline-none placeholder:text-[#3A4560]"
          style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }} />
        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Persona (opcional)"
          className="rounded px-3 py-2 text-sm outline-none placeholder:text-[#3A4560]"
          style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }} />
        <button type="submit" disabled={!jobTitle.trim() || saving}
          className="mt-1 flex items-center justify-center gap-2 rounded py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#3D7EFF" }}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Agregar
        </button>
      </form>
    </div>
  );
}

// ─── Add Division/Department panel ───────────────────────────────────────────

export function AddGroupPanel({ type, divisions, onAdd, onClose }: {
  type: "division" | "department";
  divisions: Division[];
  onAdd: (data: { name: string; color: string; divisionId?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLORS[0]);
  // Pre-selecciona la primera división para que los depts caigan dentro por default
  const [divisionId, setDivisionId] = useState<string>(
    type === "department" && divisions.length > 0 ? divisions[0].id : ""
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), color, divisionId: divisionId || undefined });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ width: 280, background: "#0E1220", border: "1px solid #1E2540", borderRadius: 8, padding: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
          {type === "division" ? "Nueva división" : "Nuevo departamento"}
        </p>
        <button onClick={onClose} className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder={type === "division" ? "ej: Comercial" : "ej: Ventas LATAM"}
          className="rounded px-3 py-2 text-sm outline-none placeholder:text-[#3A4560]"
          style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }} />
        {type === "department" && (
          <select value={divisionId} onChange={e => setDivisionId(e.target.value)}
            className="rounded px-3 py-2 text-sm outline-none"
            style={{ background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" }}>
            <option value="">Sin división (independiente)</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Color</label>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
        </div>
        <button type="submit" disabled={!name.trim() || saving}
          className="mt-1 flex items-center justify-center gap-2 rounded py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#3D7EFF" }}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Crear {type === "division" ? "división" : "departamento"}
        </button>
      </form>
    </div>
  );
}

// ─── Search Panel ────────────────────────────────────────────────────────────

export function SearchPanel({ divisions, departments, employees, onNavigate, onClose }: {
  divisions: Division[];
  departments: Department[];
  employees: Employee[];
  onNavigate: (nodeId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const r: { id: string; label: string; sub: string; color: string }[] = [];
    divisions.forEach(d => {
      if (d.name.toLowerCase().includes(q))
        r.push({ id: d.id, label: d.name, sub: "División", color: d.color ?? "#3D7EFF" });
    });
    departments.forEach(d => {
      if (d.name.toLowerCase().includes(q))
        r.push({ id: d.id, label: d.name, sub: "Departamento", color: d.color ?? "#C8902C" });
    });
    employees.forEach(e => {
      if (e.fullName.toLowerCase().includes(q) || (e.jobTitle ?? "").toLowerCase().includes(q))
        r.push({ id: e.id, label: e.fullName, sub: e.jobTitle ?? "Sin puesto", color: e.color ?? "#3D7EFF" });
    });
    return r.slice(0, 8);
  }, [query, divisions, departments, employees]);

  return (
    <div style={{ width: 300, background: "#0E1220", border: "1px solid #1E2540", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #1E2540" }}>
        <Search size={14} style={{ color: "#7A8BAD", flexShrink: 0 }} />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") onClose(); }}
          placeholder="Buscar división, dpto, persona…"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#E2E8F8", fontSize: 13 }}
        />
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#7A8BAD", cursor: "pointer", display: "flex" }}>
          <X size={14} />
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => { onNavigate(r.id); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
              onMouseEnter={ev => (ev.currentTarget.style.background = "#141928")}
              onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</p>
                <p style={{ margin: 0, fontSize: 10, color: "#7A8BAD", fontFamily: "monospace", textTransform: "uppercase" }}>{r.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && (
        <p style={{ padding: "16px 12px", textAlign: "center", color: "#7A8BAD", fontSize: 12, margin: 0 }}>Sin resultados</p>
      )}
    </div>
  );
}

// ─── Context Menu ────────────────────────────────────────────────────────────

export type CtxTarget =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "division"; id: string; x: number; y: number; isConnectable: boolean; autoSize: boolean; collapsed: boolean }
  | { kind: "department"; id: string; x: number; y: number }
  | { kind: "employee"; id: string; x: number; y: number }
  | { kind: "edge"; id: string; x: number; y: number; isSynthetic: boolean };

export function ContextMenu({ target, onAction, onClose }: {
  target: CtxTarget;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const items: { label: string; icon: React.ReactNode; action: string; danger?: boolean }[] = (() => {
    if (target.kind === "canvas") return [
      { label: "Nueva división", icon: <Layers size={13} />, action: "new-division" },
      { label: "Nuevo departamento", icon: <FolderPlus size={13} />, action: "new-department" },
      { label: "Nuevo puesto", icon: <UserPlus size={13} />, action: "new-position" },
    ];
    if (target.kind === "division") return [
      { label: "Editar división", icon: <Edit3 size={13} />, action: "edit" },
      { label: "Nuevo departamento aquí", icon: <FolderPlus size={13} />, action: "new-department-in" },
      { label: "Nuevo puesto aquí", icon: <UserPlus size={13} />, action: "new-position-in" },
      { label: target.collapsed ? "Expandir ▶" : "Colapsar ▲", icon: target.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />, action: "toggle-collapse" },
      { label: target.autoSize ? "Fijar tamaño manual" : "Activar auto-tamaño ✓", icon: <Layers size={13} />, action: "toggle-autosize" },
      { label: target.isConnectable ? "Deshabilitar conexiones" : "Habilitar conexiones ✓", icon: <Layers size={13} />, action: "toggle-connectable" },
      { label: "Renombrar", icon: <Edit3 size={13} />, action: "rename" },
      { label: "Eliminar división", icon: <Trash2 size={13} />, action: "delete", danger: true },
    ];
    if (target.kind === "department") return [
      { label: "Nuevo puesto aquí", icon: <UserPlus size={13} />, action: "new-position-in" },
      { label: "Reorganizar puestos (jerárquico)", icon: <Sparkles size={13} />, action: "reorganize-positions" },
      { label: "Editar departamento", icon: <Edit3 size={13} />, action: "edit" },
      { label: "Renombrar", icon: <Edit3 size={13} />, action: "rename" },
      { label: "Eliminar departamento", icon: <Trash2 size={13} />, action: "delete", danger: true },
    ];
    if (target.kind === "edge") {
      // Edges sintéticas (jerarquía director→depto, manager→subordinado) no se
      // pueden eliminar manualmente — se derivan de headEmployeeId/managerId.
      if (target.isSynthetic) {
        return [
          { label: "Conexión automática (no eliminable)", icon: <Layers size={13} />, action: "noop" },
          { label: "Para quitarla: cambiá manager/director del puesto", icon: <Edit3 size={13} />, action: "noop" },
        ];
      }
      return [
        { label: "Eliminar conexión", icon: <Trash2 size={13} />, action: "delete-edge", danger: true },
      ];
    }
    return [
      { label: "Nuevo subordinado", icon: <UserPlus size={13} />, action: "new-subordinate" },
      { label: "Editar", icon: <Edit3 size={13} />, action: "edit" },
      // Vaciar = mantener el nodo en la estructura, sólo quitar la persona.
      // Eliminar = borrar el puesto definitivamente (cascade limpia referencias).
      { label: "Vaciar puesto (mantener nodo)", icon: <UserPlus size={13} />, action: "vacate" },
      { label: "Eliminar puesto", icon: <Trash2 size={13} />, action: "delete", danger: true },
    ];
  })();

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div
        style={{
          position: "fixed", left: target.x, top: target.y, zIndex: 1000,
          background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6,
          padding: 4, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {items.map(item => (
          <button
            key={item.action}
            onClick={() => { onAction(item.action); onClose(); }}
            className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs transition-all"
            style={{ background: "transparent", border: "none", color: item.danger ? "#F43F5E" : "#C4CFEA", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = item.danger ? "rgba(244,63,94,0.12)" : "#1E2540")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ color: item.danger ? "#F43F5E" : "#7A8BAD" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
