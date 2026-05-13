"use client";

import dagre from "@dagrejs/dagre";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Connection,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  UserPlus, X, Loader2, Save, Layers, FolderPlus, Users, Briefcase,
  Trash2, Edit3, Sparkles, Search, ChevronDown, ChevronRight,
} from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { Employee } from "@/db/schema";
import { useOrganization } from "@clerk/nextjs";

// Tipos, nodos, modales y ColorPicker viven en src/components/dashboard/orgchart/
import type {
  Division, Department,
  EmployeeNode, DivisionNode, DepartmentNode, AnyNode,
} from "./orgchart/types";
import { COLORS } from "./orgchart/constants";
import { nodeTypes, edgeTypes } from "./orgchart/nodes";
import { ColorPicker } from "./orgchart/ColorPicker";
import {
  NewPositionModal, type NewPositionParent,
  DivisionEditModal, DepartmentEditModal,
  QuickPromptModal, RenameModal, PersonPickerModal,
} from "./orgchart/modals";


// ─── Add Position panel (toolbar) ────────────────────────────────────────────

function AddPositionPanel({
  onAdd, onClose,
}: {
  onAdd: (jobTitle: string, fullName: string, color: string) => Promise<void>;
  onClose: () => void;
}) {
  const [jobTitle, setJobTitle] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const colorRef = useRef(COLORS[Math.floor(Math.random() * COLORS.length)]);

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

function AddGroupPanel({
  type, divisions, onAdd, onClose,
}: {
  type: "division" | "department";
  divisions: Division[];
  onAdd: (data: { name: string; color: string; divisionId?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLORS[0]);
  // Pre-select first division so new departments land inside a division by default
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

// ─── Context Menu ─────────────────────────────────────────────────────────────

type CtxTarget =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "division"; id: string; x: number; y: number; isConnectable: boolean; autoSize: boolean; collapsed: boolean }
  | { kind: "department"; id: string; x: number; y: number }
  | { kind: "employee"; id: string; x: number; y: number };

function ContextMenu({ target, onAction, onClose }: {
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
    return [
      { label: "Nuevo subordinado", icon: <UserPlus size={13} />, action: "new-subordinate" },
      { label: "Editar", icon: <Edit3 size={13} />, action: "edit" },
      { label: "Archivar puesto", icon: <Trash2 size={13} />, action: "delete", danger: true },
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

// ─── Node Info Panel (employee) ──────────────────────────────────────────────

type EmployeeWithSection = Employee & { sectionName?: string | null };

// ─── Search Panel ─────────────────────────────────────────────────────────────

function SearchPanel({
  divisions, departments, employees, onNavigate, onClose,
}: {
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

// ─── NodeInfoPanel ───────────────────────────────────────────────────────────

function NodeInfoPanel({
  node, employees, divisions, departments, isAdmin, onSave, onClose,
}: {
  node: EmployeeNode;
  employees: Employee[];
  divisions: Division[];
  departments: Department[];
  isAdmin: boolean;
  onSave: (id: string, updates: Partial<EmployeeWithSection>) => Promise<void>;
  onClose: () => void;
}) {
  const emp = employees.find(e => e.id === node.id) as EmployeeWithSection | undefined;
  // State initialized from props; component is forced to remount with key={node.id}
  // by parent so swapping selected nodes resets all fields cleanly.
  const [fullName, setFullName] = useState(emp?.fullName ?? node.data.fullName);
  const [jobTitle, setJobTitle] = useState(emp?.jobTitle ?? node.data.jobTitle);
  const [description, setDescription] = useState(emp?.description ?? "");
  const [color, setColor] = useState(emp?.color ?? node.data.color ?? "#3D7EFF");
  const [divisionId, setDivisionId] = useState(emp?.divisionId ?? "");
  const [departmentId, setDepartmentId] = useState(emp?.departmentId ?? "");
  const [sectionName, setSectionName] = useState(emp?.sectionName ?? "");
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const isVacant = fullName === "[Puesto vacante]";

  const filteredDepts = divisionId
    ? departments.filter(d => d.divisionId === divisionId)
    : departments;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(node.id, {
        fullName, jobTitle, description, color,
        divisionId: divisionId || null,
        departmentId: departmentId || null,
        sectionName: sectionName || null,
      });
    } finally { setSaving(false); }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", background: "#141928", border: "1px solid #1E2540",
    borderRadius: 6, color: "#E2E8F8", fontSize: 13, padding: "7px 10px",
    outline: "none", boxSizing: "border-box",
  };

  const initials = isVacant ? "?" : fullName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  return (
    <>
      <div style={{ width: 320, background: "#0E1220", border: "1px solid #1E2540", borderRadius: 8, padding: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>Puesto</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Puesto</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} readOnly={!isAdmin} style={fieldStyle} />
          </div>

          {/* Person assigned - opens picker modal */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>
              {isVacant ? "Asignar persona" : "Persona"}
            </label>
            {isAdmin ? (
              <button
                onClick={() => setShowPicker(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  background: "#141928", border: "1px solid #1E2540", borderRadius: 6,
                  padding: "6px 10px", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: isVacant ? "#7A8BAD22" : `${color}33`,
                  border: `2px solid ${isVacant ? "#7A8BAD" : color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600,
                  color: isVacant ? "#7A8BAD" : color,
                  flexShrink: 0,
                }}>{initials}</div>
                <span style={{ flex: 1, fontSize: 13, color: isVacant ? "#7A8BAD" : "#E2E8F8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isVacant ? "Click para asignar..." : fullName}
                </span>
              </button>
            ) : (
              <p className="text-sm" style={{ color: isVacant ? "#7A8BAD" : "#E2E8F8" }}>{isVacant ? "Sin asignar" : fullName}</p>
            )}
          </div>

          {/* Color */}
          {isAdmin && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Color del puesto</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          )}

          {/* Division */}
          {isAdmin && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>División</label>
              <select value={divisionId} onChange={e => { setDivisionId(e.target.value); setDepartmentId(""); }}
                style={{ ...fieldStyle, cursor: "pointer" }}>
                <option value="">Sin división</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {/* Department */}
          {isAdmin && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Departamento</label>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                style={{ ...fieldStyle, cursor: "pointer" }}>
                <option value="">Sin departamento</option>
                {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {/* Section */}
          {isAdmin && departmentId && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Sección</label>
              <input value={sectionName} onChange={e => setSectionName(e.target.value)}
                placeholder="ej: Norte, Marketing digital..." style={fieldStyle} />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Descripción</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} readOnly={!isAdmin} rows={2}
              placeholder={isAdmin ? "Descripción del puesto" : "Sin descripción"}
              className="w-full resize-none rounded px-3 py-2 text-sm outline-none placeholder:text-[#3A4560]"
              style={isAdmin
                ? { background: "#141928", border: "1px solid #1E2540", color: "#C4CFEA" }
                : { background: "transparent", border: "none", color: "#C4CFEA" }} />
          </div>

          {isAdmin && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center justify-center gap-2 rounded py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "#3D7EFF" }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
              Guardar
            </button>
          )}
        </div>
      </div>

      {showPicker && (
        <PersonPickerModal
          employees={employees.filter(e => e.id !== node.id)}
          onPick={picked => {
            setFullName(picked.fullName);
            // also adopt their default color if current is the generic blue
            if (color === "#3D7EFF" && picked.color) setColor(picked.color);
          }}
          onClearAssignment={() => setFullName("[Puesto vacante]")}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

// ─── Debounce helper ─────────────────────────────────────────────────────────

function useDebounce<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ─── Main Canvas ─────────────────────────────────────────────────────────────

function OrgChartFlow() {
  const { employees, addEmployee, updateEmployee, deleteEmployee, error } = useEmployees();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const { screenToFlowPosition, getViewport, fitView } = useReactFlow();

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState<"division" | "department" | null>(null);
  const [pendingCreatePos, setPendingCreatePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedEmpNode, setSelectedEmpNode] = useState<EmployeeNode | null>(null);
  const [contextMenu, setContextMenu] = useState<CtxTarget | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "division" | "department"; id: string; name: string } | null>(null);
  const [newPosition, setNewPosition] = useState<NewPositionParent>(null);
  const [openNewPosition, setOpenNewPosition] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState<{ title: string; placeholder?: string; onConfirm: (v: string) => Promise<void> | void } | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [autoLayoutPending, setAutoLayoutPending] = useState(false);
  // Divisions in this set use stored sizeWidth/Height (manual) instead of auto-computed natural size
  const [manualSizeDivs, setManualSizeDivs] = useState<Set<string>>(new Set());
  const [collapsedDivs, setCollapsedDivs] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalConnectable, setGlobalConnectable] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("flowos-orgchart-global-connectable") !== "false";
  });
  // Cuando ON: al resize de un item acoplado, los hermanos del grupo también se ajustan
  const [linkedResize, setLinkedResize] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("flowos-orgchart-linked-resize") !== "false";
  });
  // Nodos que están recibiendo un cambio programático de tamaño/posición y necesitan animar.
  // Se vacía solo ~350ms después de marcar para no animar drags posteriores.
  const [syncingNodeIds, setSyncingNodeIds] = useState<Set<string>>(new Set());
  const syncingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSyncing = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setSyncingNodeIds(prev => {
      const s = new Set(prev);
      ids.forEach(id => s.add(id));
      return s;
    });
    if (syncingTimerRef.current) clearTimeout(syncingTimerRef.current);
    syncingTimerRef.current = setTimeout(() => {
      setSyncingNodeIds(new Set());
    }, 360);
  }, []);

  // Compute the flow-coords for the visible viewport center
  const getViewportCenter = useCallback((): { x: number; y: number } => {
    const vp = getViewport();
    const w = window.innerWidth, h = window.innerHeight;
    const cx = (w / 2 - vp.x) / vp.zoom;
    const cy = (h / 2 - vp.y) / vp.zoom;
    return { x: cx, y: cy };
  }, [getViewport]);

  // ── Refs estables para callbacks ──────────────────────────────────────────
  const employeesRef = useRef(employees);
  const updateEmployeeRef = useRef(updateEmployee);
  const divisionsRef = useRef<Division[]>([]);
  const departmentsRef = useRef<Department[]>([]);
  const linkedResizeRef = useRef<boolean>(true);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => { updateEmployeeRef.current = updateEmployee; }, [updateEmployee]);

  // Prevents ReactFlow from firing edge-remove events when we programmatically replace
  // the nodes array (e.g. on employee add). Without this, edges between divisions get
  // wiped from state and saved to DB as removed.
  const suppressEdgeRemove = useRef(false);

  // ── Load divisions, departments, edges ────────────────────────────────────
  const reloadGroups = useCallback(async () => {
    const [d, dp, edges] = await Promise.all([
      fetch("/api/divisions").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/departments").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/orgchart/state").then(r => r.ok ? r.json() : { edges: [] }).catch(() => ({ edges: [] })),
    ]);
    setDivisions(Array.isArray(d) ? d : []);
    setDepartments(Array.isArray(dp) ? dp : []);
    setEdges(Array.isArray(edges?.edges) ? edges.edges.map((e: Edge) => ({ ...e, type: "bicolor" })) : []);
  }, []);

  useEffect(() => { reloadGroups(); }, [reloadGroups]);
  useEffect(() => { divisionsRef.current = divisions; }, [divisions]);
  useEffect(() => { departmentsRef.current = departments; }, [departments]);
  useEffect(() => { linkedResizeRef.current = linkedResize; }, [linkedResize]);

  const handleDivisionResize = useCallback((id: string, w: number, h: number) => {
    const newW = Math.round(w);
    const newH = Math.round(h);
    // Si linkedResize y la división pertenece a un coupling group → propagar a hermanos
    const divs = divisionsRef.current;
    const div = divs.find(d => d.id === id);
    const targets = (linkedResizeRef.current && div?.couplingGroup)
      ? divs.filter(d => d.couplingGroup === div.couplingGroup).map(d => d.id)
      : [id];
    setManualSizeDivs(prev => {
      const s = new Set(prev);
      targets.forEach(t => s.add(t));
      return s;
    });
    targets.forEach(t => {
      fetch(`/api/divisions/${t}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizeWidth: newW, sizeHeight: newH }),
      }).catch(() => {});
    });
    const targetSet = new Set(targets);
    setDivisions(prev => prev.map(d => targetSet.has(d.id) ? { ...d, sizeWidth: newW, sizeHeight: newH } : d));
    // Animar hermanos sincronizados (no el que el usuario está resizeando — ése sigue el cursor)
    markSyncing(targets.filter(t => t !== id));
  }, [markSyncing]);

  // Live cascade durante el drag — solo afecta estado local (nodes), sin API.
  // Permite ver cómo los hermanos se mueven/escalan mientras todavía estás arrastrando.
  const handleDivisionResizeLive = useCallback((id: string, w: number, h: number) => {
    if (!linkedResizeRef.current) return;
    const divs = divisionsRef.current;
    const div = divs.find(d => d.id === id);
    if (!div?.couplingGroup) return;
    const group = divs.filter(d => d.couplingGroup === div.couplingGroup);
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    const baseX = sorted[0].positionX ?? 0;
    const baseY = sorted[0].positionY ?? 0;
    // Layout cumulativo en vivo: todos los del grupo comparten W y H = (w, h) del que se resizea
    let cumX = baseX;
    const updates = new Map<string, { x: number; y: number; w: number; h: number }>();
    sorted.forEach(d => {
      updates.set(d.id, { x: cumX, y: baseY, w, h });
      cumX += w;
    });
    setNodes(prev => prev.map(n => {
      const u = updates.get(n.id);
      if (!u || n.type !== "division") return n;
      return { ...n, position: { x: u.x, y: u.y }, style: { ...n.style, width: u.w, height: u.h } };
    }));
  }, []);

  const handleDepartmentResizeLive = useCallback((id: string, w: number, h: number) => {
    if (!linkedResizeRef.current) return;
    const depts = departmentsRef.current;
    const dept = depts.find(d => d.id === id);
    if (!dept?.divisionId) return;
    // BFS de adyacencia → grupo visualmente fusionado
    const visited = new Set<string>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      const cd = depts.find(d => d.id === cur);
      if (!cd) continue;
      const cX = cd.positionX ?? 0;
      const cY = cd.positionY ?? 0;
      const cW = cd.sizeWidth ?? 280;
      for (const other of depts) {
        if (other.id === cur || visited.has(other.id)) continue;
        if (other.divisionId !== cd.divisionId) continue;
        const oX = other.positionX ?? 0;
        const oY = other.positionY ?? 0;
        const oW = other.sizeWidth ?? 280;
        if (Math.abs(oY - cY) > 30) continue;
        if (Math.abs((oX + oW) - cX) < 4 || Math.abs(oX - (cX + cW)) < 4) {
          visited.add(other.id);
          queue.push(other.id);
        }
      }
    }
    if (visited.size <= 1) return;
    const oldW = dept.sizeWidth ?? 280;
    const deltaW = w - oldW;
    const groupSorted = Array.from(visited)
      .map(gid => depts.find(d => d.id === gid)!)
      .sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    const resizedIdx = groupSorted.findIndex(d => d.id === id);
    const liveUpdates = new Map<string, { x: number; h: number }>();
    groupSorted.forEach((d, i) => {
      if (d.id === id) return;
      const liveX = i > resizedIdx ? (d.positionX ?? 0) + deltaW : (d.positionX ?? 0);
      liveUpdates.set(d.id, { x: liveX, h });
    });
    setNodes(prev => prev.map(n => {
      const u = liveUpdates.get(n.id);
      if (!u || n.type !== "department") return n;
      return { ...n, position: { x: u.x, y: n.position.y }, style: { ...n.style, height: u.h } };
    }));
  }, []);

  const handleDepartmentResize = useCallback((id: string, w: number, h: number) => {
    const newW = Math.round(w);
    const newH = Math.round(h);
    const depts = departmentsRef.current;
    const dept = depts.find(d => d.id === id);
    const oldW = dept?.sizeWidth ?? 280;
    const deltaW = newW - oldW;

    type DeptUpdate = { id: string; sizeWidth?: number; sizeHeight?: number; positionX?: number };
    const updates: DeptUpdate[] = [{ id, sizeWidth: newW, sizeHeight: newH }];

    if (linkedResizeRef.current && dept?.divisionId) {
      // BFS por adyacencia para encontrar el grupo fusionado completo
      const visited = new Set<string>([id]);
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        const curDept = depts.find(d => d.id === cur);
        if (!curDept) continue;
        const cX = curDept.positionX ?? 0;
        const cY = curDept.positionY ?? 0;
        const cW = curDept.sizeWidth ?? 280;
        for (const other of depts) {
          if (other.id === cur || visited.has(other.id)) continue;
          if (other.divisionId !== curDept.divisionId) continue;
          const oX = other.positionX ?? 0;
          const oY = other.positionY ?? 0;
          const oW = other.sizeWidth ?? 280;
          if (Math.abs(oY - cY) > 30) continue;
          if (Math.abs((oX + oW) - cX) < 4 || Math.abs(oX - (cX + cW)) < 4) {
            visited.add(other.id);
            queue.push(other.id);
          }
        }
      }

      // Ordenar por X — los que están a la derecha del resizeado deben shiftearse
      // por deltaW para mantener la fusión visual cuando el W cambia.
      const groupSorted = Array.from(visited)
        .map(gid => depts.find(d => d.id === gid)!)
        .sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
      const resizedIdx = groupSorted.findIndex(d => d.id === id);

      groupSorted.forEach((d, i) => {
        if (d.id === id) return;
        const upd: DeptUpdate = { id: d.id, sizeHeight: newH };
        // Cascade shift: depts a la derecha del resizeado se mueven por deltaW
        if (i > resizedIdx && deltaW !== 0) {
          upd.positionX = (d.positionX ?? 0) + deltaW;
        }
        updates.push(upd);
      });
    }

    // Persist + actualizar estado local
    updates.forEach(u => {
      const body: Record<string, number> = {};
      if (u.sizeWidth !== undefined) body.sizeWidth = u.sizeWidth;
      if (u.sizeHeight !== undefined) body.sizeHeight = u.sizeHeight;
      if (u.positionX !== undefined) body.positionX = u.positionX;
      fetch(`/api/departments/${u.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    });
    const updateMap = new Map(updates.map(u => [u.id, u]));
    setDepartments(prev => prev.map(d => {
      const u = updateMap.get(d.id);
      if (!u) return d;
      return {
        ...d,
        ...(u.sizeWidth !== undefined && { sizeWidth: u.sizeWidth }),
        ...(u.sizeHeight !== undefined && { sizeHeight: u.sizeHeight }),
        ...(u.positionX !== undefined && { positionX: u.positionX }),
      };
    }));
    // Animar todos los hermanos sincronizados (no el resizeado — sigue el cursor)
    markSyncing(updates.map(u => u.id).filter(uid => uid !== id));
  }, [markSyncing]);

  // ── Auto-size logic ──────────────────────────────────────────────────────
  // Compute the natural size needed by a single division based on its children.
  // Truly proportional: empty divisions are small, packed divisions are big.
  const HEADER_H = 80;       // header (64) + a little gap
  const FOOTER_H_ON = 52;    // when footer is enabled
  const PADDING = 16;
  const DEPT_W = 280;
  const DEPT_H = 200;
  const DEPT_GAP = 20;
  const EMP_W = 200;
  const EMP_H = 70;
  const EMP_GAP = 12;

  const computeDivisionNaturalSize = useCallback((d: Division): { w: number; h: number } => {
    const childDepts = departments.filter(x => x.divisionId === d.id);
    const directEmps = (employees ?? []).filter(e => e.divisionId === d.id && !e.departmentId);
    const footerH = d.showFooter ? FOOTER_H_ON : 0;

    if (childDepts.length === 0 && directEmps.length === 0) {
      return { w: 320, h: HEADER_H + 60 + footerH };
    }

    // Bounding box from actual stored child positions — grows with real layout, not theory.
    let maxChildX = 0;
    let maxChildY = 0;
    childDepts.forEach(dept => {
      const empCount = (employees ?? []).filter(e => e.departmentId === dept.id).length;
      const neededH = 34 + 12 + empCount * (EMP_H + EMP_GAP) + 16;
      const dH = Math.max(dept.sizeHeight ?? DEPT_H, neededH);
      const dW = Math.max(dept.sizeWidth ?? DEPT_W, 290);
      const x = (dept.positionX ?? PADDING) + dW;
      const y = (dept.positionY ?? HEADER_H + PADDING) + dH;
      if (x > maxChildX) maxChildX = x;
      if (y > maxChildY) maxChildY = y;
    });
    directEmps.forEach(emp => {
      const x = (emp.positionX ?? PADDING) + EMP_W;
      const y = (emp.positionY ?? HEADER_H + PADDING) + EMP_H;
      if (x > maxChildX) maxChildX = x;
      if (y > maxChildY) maxChildY = y;
    });

    const w = Math.max(320, maxChildX + PADDING);
    const h = Math.max(HEADER_H + 80, maxChildY + PADDING) + footerH;
    return { w, h };
  }, [departments, employees]);

  // For coupled divisions, all in the same group share max(naturalSize) so they're symmetric.
  // For solo (uncoupled) divisions, use the natural size directly — no stored override.
  const coupledSizes = useMemo(() => {
    const sizes = new Map<string, { w: number; h: number }>();
    const groups = new Map<string, Division[]>();
    divisions.forEach(d => {
      const key = d.couplingGroup ?? `solo:${d.id}`;
      const arr = groups.get(key) ?? [];
      arr.push(d);
      groups.set(key, arr);
    });
    groups.forEach((group, key) => {
      if (key.startsWith("solo:")) {
        const d = group[0];
        sizes.set(d.id, computeDivisionNaturalSize(d));
      } else {
        let maxW = 0, maxH = 0;
        group.forEach(d => {
          const nat = computeDivisionNaturalSize(d);
          maxW = Math.max(maxW, nat.w);
          maxH = Math.max(maxH, nat.h);
        });
        group.forEach(d => sizes.set(d.id, { w: maxW, h: maxH }));
      }
    });
    return sizes;
  }, [divisions, computeDivisionNaturalSize]);

  // Adjacency: which divisions have left/right neighbors (for fused visual).
  // Derived from couplingGroup membership + positionX order — NOT from pixel tolerance.
  // This way it stays correct even when division sizes change dynamically.
  const adjacency = useMemo(() => {
    const map = new Map<string, { left: boolean; right: boolean }>();
    divisions.forEach(d => map.set(d.id, { left: false, right: false }));
    const groups = new Map<string, Division[]>();
    divisions.forEach(d => {
      if (!d.couplingGroup) return;
      const arr = groups.get(d.couplingGroup) ?? [];
      arr.push(d);
      groups.set(d.couplingGroup, arr);
    });
    groups.forEach(group => {
      if (group.length <= 1) return;
      const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
      sorted.forEach((div, i) => {
        map.set(div.id, { left: i > 0, right: i < sorted.length - 1 });
      });
    });
    return map;
  }, [divisions]);

  // Motor de layout interno por departamento: jerarquía DIR → ENC → equipo.
  // Construye un Map<empleadoId, {x, y}> para puestos NO marcados manualPosition.
  // Si manualPosition === true, respeta positionX/Y; si false, lo posiciona aquí.
  const deptInternalLayout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const COL_X = 16;          // PADDING
    const TOP_Y = 34 + 12;     // header del dept + padding
    const EMP_HEIGHT = 70 + 12; // EMP_H + EMP_GAP

    departments.forEach(dept => {
      const empsInDept = (employees ?? []).filter(e =>
        e.departmentId === dept.id &&
        e.manualPosition !== true
      );
      if (empsInDept.length === 0) return;

      const visited = new Set<string>();
      let y = TOP_Y;
      const INDENT = 20; // px por nivel de profundidad
      const place = (empId: string, depth: number = 0) => {
        if (visited.has(empId)) return;
        const emp = empsInDept.find(e => e.id === empId);
        if (!emp) return;
        visited.add(empId);
        positions.set(empId, { x: COL_X + depth * INDENT, y });
        y += EMP_HEIGHT;
        // Subordinados recursivos (los que reportan a este)
        empsInDept
          .filter(e => e.managerId === empId)
          .forEach(sub => place(sub.id, depth + 1));
      };

      // 1. Director del dpto al tope (profundidad 0)
      if (dept.headEmployeeId && empsInDept.some(e => e.id === dept.headEmployeeId)) {
        place(dept.headEmployeeId, 0);
      }
      // 2. Empleados sin manager (top-level que no son el director)
      empsInDept
        .filter(e => !e.managerId && !visited.has(e.id))
        .forEach(e => place(e.id, 0));
      // 3. Empleados huérfanos (manager fuera del dpto, o referencia inválida)
      empsInDept.forEach(e => { if (!visited.has(e.id)) place(e.id, 0); });
    });

    return positions;
  }, [departments, employees]);

  // Adyacencia entre departamentos: dos depts del MISMO division con misma Y y
  // X alineados (right de uno = left del otro, dentro de tolerancia) → se ven fusionados.
  // No requiere columna couplingGroup en DB — se deriva puramente de posiciones.
  const deptAdjacency = useMemo(() => {
    const map = new Map<string, { left: boolean; right: boolean }>();
    departments.forEach(d => map.set(d.id, { left: false, right: false }));
    // Agrupar por divisionId (sólo se fusionan depts dentro de la misma división)
    const byDiv = new Map<string, Department[]>();
    departments.forEach(d => {
      if (!d.divisionId) return;
      const arr = byDiv.get(d.divisionId) ?? [];
      arr.push(d);
      byDiv.set(d.divisionId, arr);
    });
    const TOL_X = 4;
    const TOL_Y = 30;
    byDiv.forEach(list => {
      list.forEach(a => {
        const aX = a.positionX ?? 0;
        const aY = a.positionY ?? 0;
        const aW = a.sizeWidth ?? DEPT_W;
        for (const b of list) {
          if (b.id === a.id) continue;
          const bX = b.positionX ?? 0;
          const bY = b.positionY ?? 0;
          const bW = b.sizeWidth ?? DEPT_W;
          if (Math.abs(aY - bY) > TOL_Y) continue;
          // b está pegado a la derecha de a
          if (Math.abs((aX + aW) - bX) < TOL_X) {
            const cur = map.get(a.id) ?? { left: false, right: false };
            map.set(a.id, { left: cur.left, right: true });
            const curB = map.get(b.id) ?? { left: false, right: false };
            map.set(b.id, { left: true, right: curB.right });
          }
        }
      });
    });
    return map;
  }, [departments]);

  // Dynamic positions for coupled groups: when a division grows/shrinks, right-side
  // siblings shift automatically so the group stays flush — no DB write needed.
  // Solo divisions just use their stored positionX/Y unchanged.
  const coupledGroupPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const groups = new Map<string, Division[]>();
    divisions.forEach(d => {
      if (!d.couplingGroup) return;
      const arr = groups.get(d.couplingGroup) ?? [];
      arr.push(d);
      groups.set(d.couplingGroup, arr);
    });
    // CRÍTICO: el cumX debe usar el ancho REAL que se va a renderizar
    // (mismo cálculo que computedNodes). Si una div está en manualSize, su
    // sizeWidth puede diferir del coupledSizes (que sólo calcula natural).
    // Sin esta corrección, al manual-resize una div en grupo se rompe la fusión.
    const widthFor = (d: Division) => {
      if (manualSizeDivs.has(d.id)) return d.sizeWidth ?? 720;
      return coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720;
    };
    groups.forEach(group => {
      const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
      let cumX = sorted[0].positionX ?? 0;
      const baseY = sorted[0].positionY ?? 0;
      sorted.forEach(div => {
        positions.set(div.id, { x: cumX, y: baseY });
        cumX += widthFor(div);
      });
    });
    return positions;
  }, [divisions, coupledSizes, manualSizeDivs]);

  // ── Build the React Flow nodes from data ──────────────────────────────────
  const computedNodes: AnyNode[] = useMemo(() => {
    const result: AnyNode[] = [];
    const seen = new Set<string>();
    const push = (n: AnyNode) => {
      if (seen.has(n.id)) return; // defensive dedup — avoids React duplicate-key warnings
      seen.add(n.id);
      result.push(n);
    };

    const TRANSITION = "width 220ms cubic-bezier(0.4,0,0.2,1), height 220ms cubic-bezier(0.4,0,0.2,1), transform 220ms cubic-bezier(0.4,0,0.2,1)";

    // Divisions
    divisions.forEach(d => {
      const isManual = manualSizeDivs.has(d.id);
      const isCollapsed = collapsedDivs.has(d.id);
      const isSyncing = syncingNodeIds.has(d.id);
      const size = isManual
        ? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 }
        : (coupledSizes.get(d.id) ?? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 });
      const adj = adjacency.get(d.id) ?? { left: false, right: false };
      const seniorEmp = d.seniorEmployeeId ? (employees ?? []).find(e => e.id === d.seniorEmployeeId) : null;
      const pos = coupledGroupPositions.get(d.id) ?? { x: d.positionX ?? 0, y: d.positionY ?? 0 };
      push({
        id: d.id,
        type: "division",
        position: pos,
        data: {
          name: d.name,
          color: d.color ?? "#3D7EFF",
          isDivision: true,
          subtitle: d.subtitle,
          footerText: d.footerText,
          showFooter: d.showFooter,
          adjLeft: adj.left,
          adjRight: adj.right,
          senior: seniorEmp ? { fullName: seniorEmp.fullName, jobTitle: seniorEmp.jobTitle, color: seniorEmp.color } : null,
          isConnectable: globalConnectable && d.isConnectable !== false,
          autoSize: !isManual,
          collapsed: isCollapsed,
          onResize: handleDivisionResize,
          onResizeLive: handleDivisionResizeLive,
        },
        style: {
          width: size.w,
          height: isCollapsed ? HEADER_H : size.h,
          zIndex: 0,
          ...(isSyncing && { transition: TRANSITION }),
        },
        draggable: true,
        selectable: true,
      });
    });

    // Departments — child of division if has divisionId; skip if parent division is collapsed
    departments.forEach(dp => {
      if (dp.divisionId && collapsedDivs.has(dp.divisionId)) return;
      const empCount = (employees ?? []).filter(e => e.departmentId === dp.id).length;
      const headEmp = dp.headEmployeeId ? (employees ?? []).find(e => e.id === dp.headEmployeeId) : null;
      const dAdj = deptAdjacency.get(dp.id) ?? { left: false, right: false };
      const isSyncingDept = syncingNodeIds.has(dp.id);
      // Auto-height: crece para contener todos sus empleados.
      // Fórmula: header(34) + top-pad(12) + n*EMP_STEP + bot-pad(16)
      const DEPT_HDR = 34; const DEPT_TOP_PAD = 12; const DEPT_BOT_PAD = 16;
      const EMP_STEP = EMP_H + EMP_GAP; // 82px por empleado
      const neededH = DEPT_HDR + DEPT_TOP_PAD + empCount * EMP_STEP + DEPT_BOT_PAD;
      const deptH = Math.max(dp.sizeHeight ?? DEPT_H, neededH);
      // Ancho mínimo = COL_X(16) + maxIndent(3 niveles×20=60) + cardWidth(200) + rightPad(14) = 290
      const neededW = 290;
      const deptW = Math.max(dp.sizeWidth ?? DEPT_W, neededW);
      const node: DepartmentNode = {
        id: dp.id,
        type: "department",
        position: { x: dp.positionX ?? 30, y: dp.positionY ?? 80 },
        data: {
          name: dp.name, color: dp.color ?? "#C8902C", isDepartment: true,
          head: headEmp ? { fullName: headEmp.fullName, jobTitle: headEmp.jobTitle, color: headEmp.color } : null,
          employeeCount: empCount,
          adjLeft: dAdj.left, adjRight: dAdj.right,
          onResize: handleDepartmentResize,
          onResizeLive: handleDepartmentResizeLive,
        },
        style: {
          width: deptW,
          height: deptH,
          zIndex: 1,
          ...(isSyncingDept && { transition: TRANSITION }),
        },
        draggable: true,
        selectable: true,
      };
      if (dp.divisionId) {
        node.parentId = dp.divisionId;
        node.extent = "parent";
      }
      push(node);
    });

    // Employees — child of department > division > standalone; skip if parent is collapsed
    (employees || []).forEach((emp, idx) => {
      // Skip employees whose containing division is collapsed
      if (emp.departmentId) {
        const dept = departments.find(d => d.id === emp.departmentId);
        if (dept?.divisionId && collapsedDivs.has(dept.divisionId)) return;
      } else if (emp.divisionId && collapsedDivs.has(emp.divisionId)) {
        return;
      }
      // Posición: si manualPosition=false y hay layout calculado → usar layout jerárquico.
      // Si manualPosition=true o no hay layout → usar positionX/Y del DB (drag manual).
      const autoPos = !emp.manualPosition ? deptInternalLayout.get(emp.id) : undefined;
      const pos = autoPos
        ?? { x: emp.positionX ?? ((idx % 4) * 220 + 20), y: emp.positionY ?? (Math.floor(idx / 4) * 80 + 80) };
      const node: EmployeeNode = {
        id: emp.id,
        type: "employee",
        position: pos,
        data: {
          fullName: emp.fullName,
          jobTitle: emp.jobTitle || "Sin asignar",
          color: emp.color || "#3D7EFF",
          status: emp.status,
        },
      };
      if (emp.departmentId && departments.some(d => d.id === emp.departmentId)) {
        node.parentId = emp.departmentId;
        node.extent = "parent";
      } else if (emp.divisionId && divisions.some(d => d.id === emp.divisionId)) {
        node.parentId = emp.divisionId;
        node.extent = "parent";
      }
      push(node);
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, departments, employees, coupledSizes, adjacency, coupledGroupPositions, deptAdjacency, deptInternalLayout, globalConnectable, manualSizeDivs, collapsedDivs, syncingNodeIds, handleDivisionResize, handleDepartmentResize, handleDivisionResizeLive, handleDepartmentResizeLive]);

  // Local nodes state — ReactFlow mutates this freely during drag (smooth UX).
  // We sync from `computedNodes` whenever the underlying data changes.
  const [nodes, setNodes] = useState<AnyNode[]>(computedNodes);
  useEffect(() => {
    suppressEdgeRemove.current = true;
    setNodes(computedNodes);
    requestAnimationFrame(() => { suppressEdgeRemove.current = false; });
  }, [computedNodes]);

  // ── Save edges (debounced) ────────────────────────────────────────────────
  const saveEdges = useCallback(async (edgesToSave: Edge[]) => {
    await fetch("/api/orgchart/state", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edges: edgesToSave }),
    }).catch(() => {});
  }, []);
  // Debounce corto (200ms): si el usuario cierra el browser justo después de conectar
  // dos nodos, perder 200ms es aceptable; 800ms perdía edges con regularidad.
  const debouncedSaveEdges = useDebounce(saveEdges, 200);

  // ── Snap helper: when dropping a division near another, align edges and couple ──
  // Returns { x, y, couplingGroup } if a snap should happen, else null
  const computeDivisionSnap = useCallback((draggedId: string, dragX: number, dragY: number): { x: number; y: number; couplingGroup: string; anchorId: string } | null => {
    const dragged = divisions.find(d => d.id === draggedId);
    if (!dragged) return null;
    const dragSize = coupledSizes.get(draggedId) ?? { w: dragged.sizeWidth ?? 720, h: dragged.sizeHeight ?? 500 };
    const SNAP_PX = 80;
    const Y_TOLERANCE = 100;

    for (const other of divisions) {
      if (other.id === draggedId) continue;
      // Usar la posición VISUAL (lo que el usuario ve) — para divisiones acopladas,
      // la posición real en el canvas viene de coupledGroupPositions, no de positionX.
      // Sin esto, si la división A fue acoplada a B, su positionX guardado puede
      // diferir del lugar donde realmente se ve → snap falla.
      const visual = coupledGroupPositions.get(other.id);
      const oX = visual?.x ?? other.positionX ?? 0;
      const oY = visual?.y ?? other.positionY ?? 0;
      const oSize = coupledSizes.get(other.id) ?? { w: other.sizeWidth ?? 720, h: other.sizeHeight ?? 500 };
      const yClose = Math.abs(dragY - oY) < Y_TOLERANCE;

      // Drop on right side of `other`
      if (yClose && Math.abs(dragX - (oX + oSize.w)) < SNAP_PX) {
        return { x: oX + oSize.w, y: oY, couplingGroup: other.couplingGroup ?? other.id, anchorId: other.id };
      }
      // Drop on left side of `other` — align dragged.right with other.left
      if (yClose && Math.abs((dragX + dragSize.w) - oX) < SNAP_PX) {
        return { x: oX - dragSize.w, y: oY, couplingGroup: other.couplingGroup ?? other.id, anchorId: other.id };
      }
    }
    return null;
  }, [divisions, coupledSizes, coupledGroupPositions]);

  // Snap entre departamentos del MISMO division — los pega bordes-con-bordes igual que divisiones.
  // No usa couplingGroup (no existe esa columna en depts); solo alinea X y Y.
  const computeDepartmentSnap = useCallback((draggedId: string, dragX: number, dragY: number): { x: number; y: number } | null => {
    const dragged = departments.find(d => d.id === draggedId);
    if (!dragged || !dragged.divisionId) return null;
    const dragW = dragged.sizeWidth ?? 360;
    const SNAP_PX = 60;
    const Y_TOL = 40;
    for (const other of departments) {
      if (other.id === draggedId) continue;
      if (other.divisionId !== dragged.divisionId) continue; // sólo dentro de la misma división
      const oX = other.positionX ?? 0;
      const oY = other.positionY ?? 0;
      const oW = other.sizeWidth ?? 360;
      const yClose = Math.abs(dragY - oY) < Y_TOL;
      if (yClose && Math.abs(dragX - (oX + oW)) < SNAP_PX) {
        return { x: oX + oW, y: oY };
      }
      if (yClose && Math.abs((dragX + dragW) - oX) < SNAP_PX) {
        return { x: oX - dragW, y: oY };
      }
    }
    return null;
  }, [departments]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Clamp employee/department Y inside divisions so they don't invade the header zone.
    // The header occupies the top HEADER_H px of any division.
    const DEPT_HEADER_H = 34;
    const clamped = changes.map(change => {
      if (change.type === "position" && change.position) {
        const node = nodes.find(n => n.id === change.id);
        if (!node) return change;
        if ((node.type === "employee" || node.type === "department") && node.parentId) {
          const parent = nodes.find(n => n.id === node.parentId);
          if (parent) {
            let minY = 0;
            // Empleado/Depto dentro de división: no invadir el header de la división
            if (parent.type === "division") minY = HEADER_H;
            // Empleado dentro de departamento: no invadir el header del departamento
            else if (parent.type === "department" && node.type === "employee") minY = DEPT_HEADER_H;
            if (minY && change.position.y < minY) {
              return { ...change, position: { ...change.position, y: minY } };
            }
          }
        }
      }
      return change;
    });
    // Apply (possibly clamped) changes locally for smooth dragging
    setNodes(prev => applyNodeChanges(clamped, prev) as AnyNode[]);

    // For drag-end (position with !dragging), persist to API and snap divisions
    clamped.forEach(change => {
      if (change.type === "position" && change.dragging === false && change.position) {
        const node = nodes.find(n => n.id === change.id);
        if (!node) return;
        if (node.type === "employee") {
          // Marcar manualPosition=true al arrastrar: el layout auto se desactiva
          // para este empleado y respeta su posición arrastrada.
          updateEmployeeRef.current(change.id, {
            positionX: change.position.x,
            positionY: change.position.y,
            manualPosition: true,
          }).catch(() => {});
        } else if (node.type === "division") {
          // Snap-or-decouple: dropping near another division couples them; dropping far away decouples
          const snap = computeDivisionSnap(change.id, change.position.x, change.position.y);
          const nextX = snap?.x ?? change.position.x;
          const nextY = snap?.y ?? change.position.y;
          const nextGroup: string | null = snap ? snap.couplingGroup : null;

          if (snap) {
            // Apply snap visually immediately
            setNodes(prev => prev.map(n => n.id === change.id ? { ...n, position: { x: nextX, y: nextY } } : n));
            // Symmetry fix: the anchor division also needs its couplingGroup set if it didn't have one.
            // Without this, only the dragged division gets the group key — adjacency breaks for the anchor.
            const anchor = divisions.find(d => d.id === snap.anchorId);
            if (anchor && !anchor.couplingGroup) {
              fetch(`/api/divisions/${anchor.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ couplingGroup: snap.couplingGroup }),
              }).catch(() => {});
              setDivisions(prev => prev.map(d => d.id === anchor.id ? { ...d, couplingGroup: snap.couplingGroup } : d));
            }
          }
          fetch(`/api/divisions/${change.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: nextX, positionY: nextY, couplingGroup: nextGroup }),
          }).catch(() => {});
          setDivisions(prev => prev.map(d => d.id === change.id ? { ...d, positionX: nextX, positionY: nextY, couplingGroup: nextGroup } : d));
        } else if (node.type === "department") {
          const dSnap = computeDepartmentSnap(change.id, change.position.x, change.position.y);
          const nx = dSnap?.x ?? change.position.x;
          const ny = dSnap?.y ?? change.position.y;
          if (dSnap) {
            setNodes(prev => prev.map(n => n.id === change.id ? { ...n, position: { x: nx, y: ny } } : n));
          }
          fetch(`/api/departments/${change.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: nx, positionY: ny }),
          }).catch(() => {});
          setDepartments(prev => prev.map(d => d.id === change.id ? { ...d, positionX: nx, positionY: ny } : d));
        }
      }
    });
  }, [nodes, divisions, computeDivisionSnap, computeDepartmentSnap]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => {
      const toApply = suppressEdgeRemove.current
        ? changes.filter(c => c.type !== "remove")
        : changes;
      const next = applyEdgeChanges(toApply, eds);
      if (!suppressEdgeRemove.current) debouncedSaveEdges(next);
      return next;
    });
  }, [debouncedSaveEdges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      const next = addEdge({ ...connection, type: "bicolor" }, eds);
      saveEdges(next);
      return next;
    });
  }, [saveEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: AnyNode) => {
    setContextMenu(null);
    // Single-click solo abre el panel del empleado. Divisiones/Departamentos
    // se editan vía doble-click o context menu para no interferir con el resize.
    if (node.type === "employee") {
      setSelectedEmpNode(node);
      setEditingDivision(null);
      setEditingDepartment(null);
    } else {
      setSelectedEmpNode(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEmpNode(null);
    setContextMenu(null);
  }, []);

  // Double-click: división → zoom to fit; departamento → abre modal de edición
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: AnyNode) => {
    if (node.type === "division") {
      fitView({ nodes: [{ id: node.id }], duration: 600, padding: 0.15 });
    } else if (node.type === "department") {
      const dept = departments.find(d => d.id === node.id);
      if (dept) setEditingDepartment(dept);
    }
  }, [fitView, departments]);

  // Navigate (search result click) — expand if collapsed, then zoom
  const handleNavigate = useCallback((nodeId: string) => {
    setCollapsedDivs(prev => {
      if (!prev.has(nodeId)) return prev;
      const s = new Set(prev);
      s.delete(nodeId);
      return s;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3 });
    }));
  }, [fitView]);

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setContextMenu({ kind: "canvas", x: e.clientX, y: e.clientY });
    setSelectedEmpNode(null);
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: AnyNode) => {
    e.preventDefault();
    if (node.type === "employee") setContextMenu({ kind: "employee", id: node.id, x: e.clientX, y: e.clientY });
    else if (node.type === "division") {
      const div = divisions.find(d => d.id === node.id);
      setContextMenu({ kind: "division", id: node.id, x: e.clientX, y: e.clientY, isConnectable: div?.isConnectable !== false, autoSize: !manualSizeDivs.has(node.id), collapsed: collapsedDivs.has(node.id) });
    }
    else if (node.type === "department") setContextMenu({ kind: "department", id: node.id, x: e.clientX, y: e.clientY });
  }, [divisions, manualSizeDivs, collapsedDivs]);

  // ── Create employee ───────────────────────────────────────────────────────
  const handleAddEmployee = async (jobTitle: string, fullName: string, color: string, parent?: { kind: "division" | "department"; id: string }, extras?: { description?: string; salary?: string; email?: string; phone?: string; startDate?: string; managerId?: string; }) => {
    const allEmps = employeesRef.current ?? [];
    const totalCount = allEmps.length;
    // Si va dentro de un dpto y se asigna managerId → manualPosition=false (auto-layout DIR→ENC→team).
    // Si va suelto o se rompe la cadena de jerarquía → manualPosition=true con posición calculada.
    const goesIntoDept = parent?.kind === "department";
    const useAutoLayout = goesIntoDept;
    let parentCount = 0;
    if (parent?.kind === "division") {
      parentCount = allEmps.filter(e => e.divisionId === parent.id && !e.departmentId).length;
    } else if (parent?.kind === "department") {
      parentCount = allEmps.filter(e => e.departmentId === parent.id).length;
    }
    const baseCount = parent ? parentCount : totalCount;
    const deptHeaderH = 34;
    const positionX = PADDING;
    const positionY = parent
      ? (parent.kind === "division" ? HEADER_H : deptHeaderH) + PADDING + baseCount * (EMP_H + EMP_GAP)
      : Math.floor(totalCount / 4) * 120 + 40;
    const data: Partial<Employee> & { fullName: string; jobTitle: string; color: string; positionX: number; positionY: number } = {
      fullName, jobTitle, color, positionX, positionY,
      manualPosition: !useAutoLayout,
      ...(extras?.description && { description: extras.description }),
      ...(extras?.salary && { salary: extras.salary }),
      ...(extras?.email && { email: extras.email }),
      ...(extras?.phone && { phone: extras.phone }),
      ...(extras?.startDate && { startDate: new Date(extras.startDate) }),
      ...(extras?.managerId && { managerId: extras.managerId }),
    };
    if (parent?.kind === "division") (data as Partial<Employee>).divisionId = parent.id;
    if (parent?.kind === "department") {
      (data as Partial<Employee>).departmentId = parent.id;
      const dept = departments.find(d => d.id === parent.id);
      if (dept?.divisionId) (data as Partial<Employee>).divisionId = dept.divisionId;
    }
    const newEmp = await addEmployee(data as Parameters<typeof addEmployee>[0]);
    // Auto-head: lo hace el endpoint POST /employees server-side (atomic).
    // Acá sólo sincronizamos el state local si correspondió.
    if (parent?.kind === "department" && newEmp?.id && !extras?.managerId) {
      const dept = departments.find(d => d.id === parent.id);
      if (dept && !dept.headEmployeeId) {
        setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, headEmployeeId: newEmp.id } : d));
      }
    }
    return newEmp;
  };

  // Handler used by NewPositionModal (full form)
  const handleNewPositionCreate = async (data: {
    jobTitle: string; fullName: string; color: string;
    description?: string; salary?: string; email?: string; phone?: string; startDate?: string;
    assignedEmployeeId?: string;
    reportsToId?: string;
  }) => {
    let parent: { kind: "division" | "department"; id: string } | undefined;
    if (newPosition?.kind === "division") parent = { kind: "division", id: newPosition.id };
    if (newPosition?.kind === "department") parent = { kind: "department", id: newPosition.id };
    if (newPosition?.kind === "employee") {
      const boss = employees.find(e => e.id === newPosition.id);
      if (boss?.departmentId) parent = { kind: "department", id: boss.departmentId };
      else if (boss?.divisionId) parent = { kind: "division", id: boss.divisionId };
    }
    // managerId: prioridad explícita del usuario → headEmployeeId del dept → parent employee
    let managerId: string | undefined = data.reportsToId;
    if (!managerId && newPosition?.kind === "department") {
      const deptForHead = departments.find(d => d.id === newPosition.id);
      if (deptForHead?.headEmployeeId) managerId = deptForHead.headEmployeeId;
    }
    if (!managerId && newPosition?.kind === "employee") managerId = newPosition.id;
    await handleAddEmployee(
      data.jobTitle,
      data.fullName,
      data.color,
      parent,
      {
        description: data.description, salary: data.salary,
        email: data.email, phone: data.phone, startDate: data.startDate,
        managerId,
      }
    );
  };

  // ── Create division ───────────────────────────────────────────────────────
  const handleAddDivision = async (data: { name: string; color: string }, position?: { x: number; y: number }) => {
    // Default position: viewport center if not specified, else stored pendingCreatePos, else 0/0
    const pos = position ?? pendingCreatePos ?? getViewportCenter();
    // Centrado usando el tamaño natural mínimo (que es lo que realmente se renderiza
    // si la división está vacía); así el click cae cerca del centro visual de la división.
    const naturalW = 320;
    const naturalH = 180;
    const x = pos.x - naturalW / 2;
    const y = pos.y - naturalH / 2;
    const res = await fetch("/api/divisions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name, color: data.color,
        positionX: x, positionY: y,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setDivisions(prev => [...prev, created]);
    }
    setPendingCreatePos(null);
  };

  // ── Create department ─────────────────────────────────────────────────────
  const handleAddDepartment = async (data: { name: string; color: string; divisionId?: string }, position?: { x: number; y: number }) => {
    const inDivision = data.divisionId;
    const sameDivCount = departments.filter(d => d.divisionId === inDivision).length;
    const standaloneCount = departments.filter(d => !d.divisionId).length;
    const res = await fetch("/api/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name, color: data.color,
        divisionId: inDivision,
        positionX: position?.x ?? (inDivision ? PADDING + sameDivCount * (DEPT_W + DEPT_GAP) : standaloneCount * 400 + 50),
        positionY: position?.y ?? (inDivision ? HEADER_H + PADDING : 600),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setDepartments(prev => [...prev, created]);
      // Pan to the new department so it's visible immediately
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fitView({ nodes: [{ id: created.id }], duration: 500, padding: 0.4 });
      }));
    }
  };

  // ── Delete handlers ───────────────────────────────────────────────────────
  const deleteDivision = async (id: string) => {
    if (!confirm("¿Eliminar la división? Sus departamentos quedarán independientes.")) return;
    await fetch(`/api/divisions/${id}`, { method: "DELETE" });
    setDivisions(prev => prev.filter(d => d.id !== id));
    setDepartments(prev => prev.map(d => d.divisionId === id ? { ...d, divisionId: null } : d));
  };
  const deleteDepartment = async (id: string) => {
    if (!confirm("¿Eliminar el departamento? Los empleados quedarán sin departamento.")) return;
    await fetch(`/api/departments/${id}`, { method: "DELETE" });
    setDepartments(prev => prev.filter(d => d.id !== id));
  };

  // ── Context menu actions ──────────────────────────────────────────────────
  const handleCtxAction = async (action: string) => {
    if (!contextMenu) return;
    const t = contextMenu;

    if (t.kind === "canvas") {
      // Convert screen coords (where the user right-clicked) to flow coords
      const flowPos = screenToFlowPosition({ x: t.x, y: t.y });
      setPendingCreatePos(flowPos);
      if (action === "new-division") setShowAddGroup("division");
      if (action === "new-department") setShowAddGroup("department");
      if (action === "new-position") setShowAddEmp(true);
    }

    if (t.kind === "division") {
      const div = divisions.find(d => d.id === t.id);
      if (action === "edit" && div) { setEditingDivision(div); setContextMenu(null); }
      if (action === "new-department-in") {
        setQuickPrompt({
          title: `Nuevo departamento en "${div?.name ?? ""}"`,
          placeholder: "Nombre del departamento",
          onConfirm: async (name) => {
            await handleAddDepartment({ name, color: div?.color ?? "#C8902C", divisionId: t.id });
          },
        });
      }
      if (action === "new-position-in" && div) {
        setNewPosition({ kind: "division", id: t.id, name: div.name, color: div.color ?? "#3D7EFF" });
        setOpenNewPosition(true);
      }
      if (action === "toggle-collapse") {
        setCollapsedDivs(prev => {
          const s = new Set(prev);
          if (s.has(t.id)) s.delete(t.id); else s.add(t.id);
          return s;
        });
      }
      if (action === "toggle-autosize") {
        setManualSizeDivs(prev => {
          const s = new Set(prev);
          if (s.has(t.id)) s.delete(t.id); else s.add(t.id);
          return s;
        });
      }
      if (action === "toggle-connectable" && div) {
        const next = div.isConnectable === false ? true : false;
        fetch(`/api/divisions/${t.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isConnectable: next }),
        }).catch(() => {});
        setDivisions(prev => prev.map(d => d.id === t.id ? { ...d, isConnectable: next } : d));
      }
      if (action === "rename" && div) setRenaming({ kind: "division", id: t.id, name: div.name });
      if (action === "delete") await deleteDivision(t.id);
    }

    if (t.kind === "department") {
      const dept = departments.find(d => d.id === t.id);
      if (action === "edit" && dept) { setEditingDepartment(dept); setContextMenu(null); }
      if (action === "new-position-in" && dept) {
        setNewPosition({ kind: "department", id: t.id, name: dept.name, color: dept.color ?? "#C8902C" });
        setOpenNewPosition(true);
      }
      if (action === "reorganize-positions") {
        // Limpiar manualPosition=false en todos los empleados del dpto → activa layout jerárquico
        const empsInDept = (employees ?? []).filter(e => e.departmentId === t.id);
        await Promise.all(empsInDept.map(e =>
          updateEmployeeRef.current(e.id, { manualPosition: false }).catch(() => {})
        ));
      }
      if (action === "rename" && dept) setRenaming({ kind: "department", id: t.id, name: dept.name });
      if (action === "delete") await deleteDepartment(t.id);
    }

    if (t.kind === "employee") {
      const emp = employees.find(e => e.id === t.id);
      if (action === "edit") {
        const node = nodes.find(n => n.id === t.id) as EmployeeNode | undefined;
        if (node) setSelectedEmpNode(node);
      }
      if (action === "new-subordinate" && emp) {
        // Inherit color from boss
        setNewPosition({
          kind: "employee", id: emp.id,
          fullName: emp.fullName, jobTitle: emp.jobTitle ?? "",
          color: emp.color ?? "#3D7EFF",
        });
        setOpenNewPosition(true);
      }
      if (action === "delete") {
        setQuickPrompt({
          title: "Archivar puesto",
          placeholder: 'Escribí "ARCHIVAR" para confirmar',
          onConfirm: async (v) => {
            if (v.toUpperCase() === "ARCHIVAR") {
              // Usar el hook para que SWR refresque la UI al instante.
              // El fetch directo NO actualizaba la cache → el puesto seguía visible
              // hasta que algo más reseteaba el estado (mover el canvas, p.ej.).
              await deleteEmployee(t.id);
              if (selectedEmpNode?.id === t.id) setSelectedEmpNode(null);
            }
          },
        });
      }
    }
  };

  const handleSaveEmployee = async (id: string, updates: Partial<EmployeeWithSection>) => {
    await updateEmployeeRef.current(id, updates);
    setSelectedEmpNode(prev => prev?.id === id ? { ...prev, data: { ...prev.data, fullName: updates.fullName ?? prev.data.fullName, jobTitle: updates.jobTitle ?? prev.data.jobTitle } } : prev);
  };

  const handleSaveDivision = async (updates: Partial<Division>) => {
    if (!editingDivision) return;
    await fetch(`/api/divisions/${editingDivision.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setDivisions(prev => prev.map(d => d.id === editingDivision.id ? { ...d, ...updates } : d));
  };

  const handleSaveDepartment = async (updates: Partial<Department>) => {
    if (!editingDepartment) return;
    await fetch(`/api/departments/${editingDepartment.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setDepartments(prev => prev.map(d => d.id === editingDepartment.id ? { ...d, ...updates } : d));
  };

  const handleAutoLayout = useCallback(async () => {
    setAutoLayoutPending(true);
    try {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 120, marginx: 50, marginy: 50 });

      // Group coupled divisions — treat each coupling group as a single dagre node
      const couplingGroups = new Map<string, Division[]>();
      const standaloneDivs: Division[] = [];
      divisions.forEach(d => {
        if (d.couplingGroup) {
          const arr = couplingGroups.get(d.couplingGroup) ?? [];
          arr.push(d);
          couplingGroups.set(d.couplingGroup, arr);
        } else {
          standaloneDivs.push(d);
        }
      });

      // Standalone divisions → individual dagre nodes
      standaloneDivs.forEach(d => {
        const sz = coupledSizes.get(d.id) ?? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 };
        g.setNode(d.id, { width: sz.w, height: sz.h });
      });

      // Coupling groups → one dagre node each (combined width, max height)
      couplingGroups.forEach((group, groupKey) => {
        const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
        const totalW = sorted.reduce((sum, d) => sum + (coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720), 0);
        const maxH = Math.max(...sorted.map(d => coupledSizes.get(d.id)?.h ?? d.sizeHeight ?? 500));
        g.setNode(`__group_${groupKey}`, { width: totalW, height: maxH });
      });

      // Map division ID → dagre node ID (handles coupling)
      const getDagreId = (divId: string): string | null => {
        const div = divisions.find(d => d.id === divId);
        if (!div) return null;
        return div.couplingGroup ? `__group_${div.couplingGroup}` : divId;
      };

      // Add edges between divisions
      edges.forEach(e => {
        const src = getDagreId(e.source);
        const tgt = getDagreId(e.target);
        if (src && tgt && src !== tgt && g.hasNode(src) && g.hasNode(tgt)) {
          g.setEdge(src, tgt);
        }
      });

      dagre.layout(g);

      const newDivPositions = new Map<string, { x: number; y: number }>();

      standaloneDivs.forEach(d => {
        const n = g.node(d.id);
        if (!n) return;
        const sz = coupledSizes.get(d.id) ?? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 };
        newDivPositions.set(d.id, { x: n.x - sz.w / 2, y: n.y - sz.h / 2 });
      });

      couplingGroups.forEach((group, groupKey) => {
        const n = g.node(`__group_${groupKey}`);
        if (!n) return;
        const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
        const totalW = sorted.reduce((sum, d) => sum + (coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720), 0);
        const maxH = Math.max(...sorted.map(d => coupledSizes.get(d.id)?.h ?? d.sizeHeight ?? 500));
        let cumX = n.x - totalW / 2;
        const baseY = n.y - maxH / 2;
        sorted.forEach(d => {
          const dw = coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720;
          newDivPositions.set(d.id, { x: cumX, y: baseY });
          cumX += dw;
        });
      });

      // Re-layout departments within each division: single horizontal row.
      // Acumulamos X usando el ancho real de cada dept para que queden bien fusionados.
      const newDeptPositions = new Map<string, { x: number; y: number }>();
      const HDR = 80; const PAD = 16; const DG = 20;
      divisions.forEach(div => {
        let cumX = PAD;
        departments.filter(dp => dp.divisionId === div.id).forEach(dept => {
          newDeptPositions.set(dept.id, { x: cumX, y: HDR + PAD });
          cumX += (dept.sizeWidth ?? 280) + DG;
        });
      });

      // Batch save to API
      await Promise.all([
        ...Array.from(newDivPositions.entries()).map(([id, pos]) =>
          fetch(`/api/divisions/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: pos.x, positionY: pos.y }),
          })
        ),
        ...Array.from(newDeptPositions.entries()).map(([id, pos]) =>
          fetch(`/api/departments/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: pos.x, positionY: pos.y }),
          })
        ),
      ]);

      // Update local state — computedNodes effect will re-sync ReactFlow
      setDivisions(prev => prev.map(d => {
        const pos = newDivPositions.get(d.id);
        return pos ? { ...d, positionX: pos.x, positionY: pos.y } : d;
      }));
      setDepartments(prev => prev.map(dp => {
        const pos = newDeptPositions.get(dp.id);
        return pos ? { ...dp, positionX: pos.x, positionY: pos.y } : dp;
      }));
    } finally {
      setAutoLayoutPending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, departments, edges, coupledSizes]);

  const handleRename = async (newName: string) => {
    if (!renaming) return;
    if (renaming.kind === "division") {
      await fetch(`/api/divisions/${renaming.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      setDivisions(prev => prev.map(d => d.id === renaming.id ? { ...d, name: newName } : d));
    } else {
      await fetch(`/api/departments/${renaming.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      setDepartments(prev => prev.map(d => d.id === renaming.id ? { ...d, name: newName } : d));
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center" style={{ background: "#080B12" }}>
        <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg p-5 text-center"
          style={{ background: "#0E1220", border: "1px solid rgba(244,63,94,0.3)" }}>
          <p className="text-sm font-medium" style={{ color: "#F43F5E" }}>Error al cargar empleados</p>
          <p className="text-xs leading-relaxed" style={{ color: "#7A8BAD" }}>{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Estilos globales para nodos del orgchart — animaciones y hover */}
      <style>{`
        .react-flow__node-division:hover,
        .react-flow__node-department:hover {
          filter: brightness(1.05);
        }
        .react-flow__node-employee:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        @keyframes flowos-node-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .react-flow__node-division,
        .react-flow__node-department,
        .react-flow__node-employee {
          animation: flowos-node-fade-in 200ms cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Control"
        selectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "bicolor" }}
        style={{ background: "#080B12" }}
      >
        <Background color="#1E2540" gap={32} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as { color?: string };
            return data?.color || "#3D7EFF";
          }}
          maskColor="rgba(8,11,18,0.7)"
        />

        {/* Toolbar */}
        {isAdmin && (
          <Panel position="top-right" className="m-4">
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-1.5 justify-end" style={{ maxWidth: 520 }}>
                <button
                  onClick={() => setSearchOpen(prev => !prev)}
                  title="Buscar (Ctrl+F)"
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: searchOpen ? "rgba(61,126,255,0.2)" : "rgba(61,126,255,0.08)",
                    color: searchOpen ? "#3D7EFF" : "#7A8BAD",
                    border: `1px solid ${searchOpen ? "rgba(61,126,255,0.4)" : "#1E2540"}`,
                  }}
                >
                  <Search className="h-3 w-3" />
                  Buscar
                </button>
                <button
                  onClick={() => { if (!autoLayoutPending) handleAutoLayout(); }}
                  disabled={autoLayoutPending}
                  title="Auto-layout: distribuye divisiones automáticamente con dagre"
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: "rgba(168,85,247,0.12)", color: "#A855F7",
                    border: "1px solid rgba(168,85,247,0.3)",
                    opacity: autoLayoutPending ? 0.6 : 1,
                  }}
                >
                  {autoLayoutPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Sparkles className="h-3 w-3" />}
                  {autoLayoutPending ? "Layouteando..." : "Auto-layout"}
                </button>
                <button
                  onClick={() => { setPendingCreatePos(null); setShowAddGroup("division"); setShowAddEmp(false); }}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{ background: "rgba(61,126,255,0.12)", color: "#3D7EFF", border: "1px solid rgba(61,126,255,0.3)" }}
                >
                  <Layers className="h-3 w-3" />
                  División
                </button>
                <button
                  onClick={() => { setPendingCreatePos(null); setShowAddGroup("department"); setShowAddEmp(false); }}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{ background: "rgba(200,144,44,0.12)", color: "#C8902C", border: "1px solid rgba(200,144,44,0.3)" }}
                >
                  <FolderPlus className="h-3 w-3" />
                  Departamento
                </button>
                <button
                  onClick={() => { setPendingCreatePos(null); setShowAddEmp(true); setShowAddGroup(null); }}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
                  style={{ background: "#3D7EFF", boxShadow: "0 0 12px rgba(61,126,255,0.35)" }}
                >
                  <UserPlus className="h-3 w-3" />
                  Puesto
                </button>
                <button
                  onClick={() => {
                    const next = !globalConnectable;
                    setGlobalConnectable(next);
                    try { localStorage.setItem("flowos-orgchart-global-connectable", String(next)); } catch {}
                  }}
                  title={globalConnectable ? "Conexiones a divisiones: ON (click para desactivar global)" : "Conexiones a divisiones: OFF (click para activar global)"}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: globalConnectable ? "rgba(16,217,160,0.1)" : "rgba(122,139,173,0.1)",
                    color: globalConnectable ? "#10D9A0" : "#7A8BAD",
                    border: `1px solid ${globalConnectable ? "rgba(16,217,160,0.3)" : "#1E2540"}`,
                  }}
                >
                  {globalConnectable ? "🔗 Conectables" : "✕ No conectables"}
                </button>
                <button
                  onClick={() => {
                    const next = !linkedResize;
                    setLinkedResize(next);
                    try { localStorage.setItem("flowos-orgchart-linked-resize", String(next)); } catch {}
                  }}
                  title={linkedResize ? "Tamaño vinculado: ON — al cambiar tamaño se ajustan los items acoplados" : "Tamaño vinculado: OFF — resize independiente"}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: linkedResize ? "rgba(168,85,247,0.1)" : "rgba(122,139,173,0.1)",
                    color: linkedResize ? "#A855F7" : "#7A8BAD",
                    border: `1px solid ${linkedResize ? "rgba(168,85,247,0.3)" : "#1E2540"}`,
                  }}
                >
                  {linkedResize ? "🔗 Tamaño vinc." : "✕ Tamaño libre"}
                </button>
              </div>
              {searchOpen && (
                <SearchPanel
                  divisions={divisions}
                  departments={departments}
                  employees={employees}
                  onNavigate={handleNavigate}
                  onClose={() => setSearchOpen(false)}
                />
              )}
              {showAddEmp && (
                <AddPositionPanel
                  onAdd={(jt, fn, c) => handleAddEmployee(jt, fn, c)}
                  onClose={() => setShowAddEmp(false)}
                />
              )}
              {showAddGroup === "division" && (
                <AddGroupPanel type="division" divisions={divisions}
                  onAdd={d => handleAddDivision(d)} onClose={() => setShowAddGroup(null)} />
              )}
              {showAddGroup === "department" && (
                <AddGroupPanel type="department" divisions={divisions}
                  onAdd={d => handleAddDepartment(d)} onClose={() => setShowAddGroup(null)} />
              )}
            </div>
          </Panel>
        )}

        {/* Employee panel — key={node.id} forces remount on selection change so all fields reset cleanly */}
        {selectedEmpNode && (
          <Panel position="top-left" className="m-4">
            <NodeInfoPanel
              key={selectedEmpNode.id}
              node={selectedEmpNode}
              employees={employees}
              divisions={divisions}
              departments={departments}
              isAdmin={isAdmin}
              onSave={handleSaveEmployee}
              onClose={() => setSelectedEmpNode(null)}
            />
          </Panel>
        )}

        {/* Hint badge */}
        {!selectedEmpNode && !showAddEmp && !showAddGroup && (
          <Panel position="top-left" className="m-4">
            <div className="flex items-center gap-2 px-3 py-2 text-xs"
              style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6, color: "#7A8BAD" }}>
              <Sparkles className="h-3.5 w-3.5" style={{ color: "#3D7EFF" }} />
              Click derecho para crear · Drag para mover · Delete para conexiones
            </div>
          </Panel>
        )}

        {/* Stats badge */}
        <Panel position="bottom-left" className="m-4 mb-16">
          <div className="flex gap-3 px-3 py-2 text-[10px] font-mono"
            style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6, color: "#7A8BAD" }}>
            <span className="flex items-center gap-1"><Layers size={11} /> {divisions.length}</span>
            <span className="flex items-center gap-1"><FolderPlus size={11} /> {departments.length}</span>
            <span className="flex items-center gap-1"><Users size={11} /> {employees.length}</span>
            <span className="flex items-center gap-1"><Briefcase size={11} /> {employees.filter(e => e.fullName !== "[Puesto vacante]").length}</span>
          </div>
        </Panel>
      </ReactFlow>

      {/* Context menu (rendered outside ReactFlow) */}
      {contextMenu && (
        <ContextMenu target={contextMenu} onAction={handleCtxAction} onClose={() => setContextMenu(null)} />
      )}

      {/* Rename modal */}
      {renaming && (
        <RenameModal
          initialValue={renaming.name}
          title={renaming.kind === "division" ? "Renombrar división" : "Renombrar departamento"}
          onSave={handleRename}
          onClose={() => setRenaming(null)}
        />
      )}

      {/* New position modal (full form) */}
      {openNewPosition && (
        <NewPositionModal
          parent={newPosition}
          employees={employees}
          departments={departments}
          defaultColor={newPosition?.color ?? "#3D7EFF"}
          onCreate={handleNewPositionCreate}
          onClose={() => { setOpenNewPosition(false); setNewPosition(null); }}
        />
      )}

      {/* Quick prompt modal (lightweight) */}
      {quickPrompt && (
        <QuickPromptModal
          title={quickPrompt.title}
          placeholder={quickPrompt.placeholder}
          onConfirm={quickPrompt.onConfirm}
          onClose={() => setQuickPrompt(null)}
        />
      )}

      {/* Division edit modal */}
      {editingDivision && (
        <DivisionEditModal
          key={editingDivision.id}
          division={editingDivision}
          employees={employees}
          onSave={handleSaveDivision}
          onDelete={async () => { await deleteDivision(editingDivision.id); setEditingDivision(null); }}
          onClose={() => setEditingDivision(null)}
        />
      )}

      {/* Department edit modal */}
      {editingDepartment && (
        <DepartmentEditModal
          key={editingDepartment.id}
          department={editingDepartment}
          employees={employees}
          onSave={handleSaveDepartment}
          onClose={() => setEditingDepartment(null)}
        />
      )}
    </>
  );
}

export function OrgChartCanvas() {
  return (
    <ReactFlowProvider>
      <OrgChartFlow />
    </ReactFlowProvider>
  );
}
