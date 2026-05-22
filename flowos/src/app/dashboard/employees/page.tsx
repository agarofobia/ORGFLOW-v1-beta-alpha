"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useToast } from "@/components/ui/toast";
import { Plus, Search, X, Check, Archive, Save, ExternalLink, ChevronDown, Upload, UserPlus } from "lucide-react";

// Vacancy helpers — un puesto está vacante cuando su nombre es el placeholder.
const VACANT_NAME = "[Puesto vacante]";
const isVacant = (e: { fullName: string }) => e.fullName === VACANT_NAME;

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnboardingItem { id: string; label: string; done: boolean; }

interface Division { id: string; name: string; }
interface Department { id: string; name: string; divisionId: string | null; }

interface Employee {
  id: string;
  organizationId: string;
  fullName: string;
  jobTitle?: string;
  description?: string;
  email?: string;
  phone?: string;
  salary?: number;
  status: "active" | "inactive" | "on_leave";
  color?: string;
  imageUrl?: string | null;
  startDate?: string;
  departmentId?: string;
  divisionId?: string;
  managerId?: string;
  userId?: string | null;
  metadata?: { onboarding?: OnboardingItem[] };
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ONBOARDING: OnboardingItem[] = [
  { id: "1", label: "Accesos al sistema configurados", done: false },
  { id: "2", label: "Contrato firmado", done: false },
  { id: "3", label: "Email corporativo activo", done: false },
  { id: "4", label: "Presentación al equipo", done: false },
  { id: "5", label: "Revisión del reglamento interno", done: false },
  { id: "6", label: "Capacitación inicial completada", done: false },
  { id: "7", label: "Equipo / hardware asignado", done: false },
  { id: "8", label: "Credenciales de herramientas", done: false },
];

const PRESET_COLORS = ["#3D7EFF","#10D9A0","#F59E0B","#F43F5E","#A855F7","#EC4899","#06B6D4","#84CC16"];
const STATUS_LABELS: Record<string, string> = { active: "Activo", inactive: "Inactivo", on_leave: "Licencia" };
const STATUS_COLORS: Record<string, string> = { active: "#10D9A0", inactive: "#7A8BAD", on_leave: "#F59E0B" };

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#7A8BAD",
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", backgroundColor: "#141928", border: "1px solid #1E2540",
  borderRadius: 6, color: "#E2E8F8", fontSize: 13, padding: "9px 12px",
  outline: "none", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer", appearance: "none",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function Avatar({ name, color, size = 40, imageUrl }: { name: string; color?: string; size?: number; imageUrl?: string | null }) {
  const vacant = isVacant({ fullName: name });
  const bg = vacant ? "#3A4560" : (color || "#3D7EFF");
  const [imageError, setImageError] = useState(false);
  const hasImage = imageUrl && !imageError && !vacant;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      backgroundColor: vacant ? "#141928" : bg + "33",
      border: `2px dashed ${vacant ? "#3A4560" : bg}`,
      borderStyle: vacant ? "dashed" : "solid",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      fontSize: size * 0.35, fontWeight: 600, color: bg,
      overflow: "hidden",
    }}>
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt={name}
          onError={() => setImageError(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : vacant ? (
        <UserPlus size={size * 0.42} strokeWidth={1.5} color="#7A8BAD" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

function MetricChip({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 10px",
      background: `${color}15`,
      border: `1px solid ${color}33`,
      borderRadius: 14,
      fontSize: 11, fontFamily: "monospace",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      <span style={{ color, fontWeight: 700 }}>{value}</span>
      <span style={{ color: "#7A8BAD" }}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#7A8BAD";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, backgroundColor: color + "20", color, border: `1px solid ${color}40` }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color }} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ─── Add Employee Modal ───────────────────────────────────────────────────────

function AddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ fullName: "", jobTitle: "", email: "", phone: "", color: PRESET_COLORS[0] });
  const [customColor, setCustomColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      onCreated(); onClose();
    } catch { setError("No se pudo crear el empleado."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 480, backgroundColor: "#0E1220", border: "1px solid #1E2540", borderRadius: 8, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ color: "#E2E8F8", fontSize: 18, fontWeight: 600, margin: 0 }}>Nuevo empleado</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7A8BAD", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <p style={{ color: "#F43F5E", fontSize: 13, margin: 0 }}>{error}</p>}
          <div><label style={labelStyle}>Nombre completo *</label><input style={inputStyle} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Ana García" /></div>
          <div><label style={labelStyle}>Puesto</label><input style={inputStyle} value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} placeholder="Diseñadora UX" /></div>
          <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ana@empresa.com" /></div>
          <div><label style={labelStyle}>Teléfono</label><input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+54 11 0000-0000" /></div>
          <div>
            <label style={labelStyle}>Color de avatar</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => { setForm({ ...form, color: c }); setCustomColor(""); }}
                  style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: c, border: form.color === c && !customColor ? "3px solid #E2E8F8" : "3px solid transparent", cursor: "pointer", outline: "none", flexShrink: 0 }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: customColor || form.color, border: "2px solid #1E2540", flexShrink: 0 }} />
              <input
                type="text"
                value={customColor}
                onChange={e => {
                  const val = e.target.value;
                  setCustomColor(val);
                  if (/^#[0-9A-Fa-f]{6}$/.test(val)) setForm({ ...form, color: val });
                }}
                placeholder="#3D7EFF"
                maxLength={7}
                style={{ ...inputStyle, flex: 1, fontFamily: "monospace", letterSpacing: "0.05em" }}
              />
              <input type="color" value={form.color} onChange={e => { setForm({ ...form, color: e.target.value }); setCustomColor(e.target.value); }}
                style={{ width: 36, height: 36, border: "1px solid #1E2540", borderRadius: 6, background: "#141928", cursor: "pointer", padding: 2 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: "10px 0", backgroundColor: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Creando..." : "Crear empleado"}
            </button>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 0", backgroundColor: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, fontSize: 14, cursor: "pointer" }}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Archive Confirm Modal ────────────────────────────────────────────────────

function ArchiveModal({ employee, onClose, onArchived }: { employee: Employee; onClose: () => void; onArchived: () => void }) {
  const [loading, setLoading] = useState(false);
  const handleArchive = async () => {
    setLoading(true);
    await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
    onArchived(); onClose();
    setLoading(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div style={{ backgroundColor: "#0E1220", border: "1px solid #1E2540", borderRadius: 8, padding: 32, maxWidth: 400, width: "100%" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: "#E2E8F8", fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Archivar empleado</h3>
        <p style={{ color: "#7A8BAD", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          ¿Archivás a <strong style={{ color: "#E2E8F8" }}>{employee.fullName}</strong>? Pasará a inactivo y seguirá visible en el filtro de inactivos.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={handleArchive} disabled={loading} style={{ flex: 1, padding: "10px 0", backgroundColor: "#F43F5E", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Archivando..." : "Archivar"}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", backgroundColor: "transparent", color: "#7A8BAD", border: "1px solid #1E2540", borderRadius: 6, fontSize: 14, cursor: "pointer" }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Dropdown (custom, matches app's dark theme) ─────────────────────

type EmpStatus = "active" | "inactive" | "on_leave";

function StatusDropdown({ value, onChange }: {
  value: EmpStatus;
  onChange: (v: EmpStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options: { v: EmpStatus; label: string; color: string }[] = [
    { v: "active",   label: "Activo",   color: "#10D9A0" },
    { v: "inactive", label: "Inactivo", color: "#7A8BAD" },
    { v: "on_leave", label: "Licencia", color: "#F59E0B" },
  ];
  const current = options.find(o => o.v === value) ?? options[0];

  // Cerrar al clickear afuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          backgroundColor: "#141928",
          border: `1px solid ${open ? current.color + "66" : "#1E2540"}`,
          borderRadius: 6,
          color: current.color,
          fontSize: 12, fontWeight: 500,
          padding: "4px 8px",
          cursor: "pointer",
          outline: "none",
          minWidth: 90,
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: current.color }} />
          {current.label}
        </span>
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          backgroundColor: "#0E1220",
          border: "1px solid #1E2540",
          borderRadius: 6,
          minWidth: 130,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: 4,
          zIndex: 100,
        }}>
          {options.map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => { onChange(opt.v); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%",
                background: opt.v === value ? "#1E2540" : "transparent",
                border: "none",
                borderRadius: 4,
                color: opt.color,
                fontSize: 12,
                padding: "6px 10px",
                cursor: "pointer",
                textAlign: "left",
                fontWeight: opt.v === value ? 600 : 400,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#1E2540")}
              onMouseLeave={e => (e.currentTarget.style.background = opt.v === value ? "#1E2540" : "transparent")}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: opt.color }} />
              {opt.label}
              {opt.v === value && <Check size={12} style={{ marginLeft: "auto", color: opt.color }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filter Dropdown (generic, custom dark theme) ───────────────────────────

function FilterDropdown<T extends string>({ value, onChange, options, label, accentColor }: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; label: string; color?: string }>;
  label: string; // label corto mostrado cuando value === "" (sin filtro)
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.v === value);
  const isActive = value !== ("" as T) && value !== ("all" as T);
  const accent = accentColor ?? "#3D7EFF";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: isActive ? `${accent}15` : "#0E1220",
          border: `1px solid ${isActive ? `${accent}50` : "#1E2540"}`,
          borderRadius: 20,
          color: isActive ? accent : "#7A8BAD",
          fontSize: 11, fontWeight: 500,
          padding: "5px 12px",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {current?.color && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: current.color }} />
        )}
        {isActive && current ? current.label : label}
        <ChevronDown size={11} style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          backgroundColor: "#0E1220",
          border: "1px solid #1E2540",
          borderRadius: 8,
          minWidth: 180,
          maxHeight: 260,
          overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: 4,
          zIndex: 100,
        }}>
          {options.map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => { onChange(opt.v); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%",
                background: opt.v === value ? "#1E2540" : "transparent",
                border: "none",
                borderRadius: 4,
                color: opt.color || "#E2E8F8",
                fontSize: 12,
                padding: "6px 10px",
                cursor: "pointer",
                textAlign: "left",
                fontWeight: opt.v === value ? 600 : 400,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#1E2540")}
              onMouseLeave={e => (e.currentTarget.style.background = opt.v === value ? "#1E2540" : "transparent")}
            >
              {opt.color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: opt.color }} />}
              {opt.label}
              {opt.v === value && <Check size={11} style={{ marginLeft: "auto", color: opt.color ?? accent }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Employee Panel (drawer overlay) ─────────────────────────────────────────

function EmployeePanel({ employee, onClose, onUpdated, onArchive, isAdmin, myEmployeeId, myInternalUserId, onLink, onUnlink }: {
  employee: Employee; onClose: () => void;
  onUpdated: (e: Employee) => void; onArchive: (e: Employee) => void; isAdmin: boolean;
  myEmployeeId: string | null; myInternalUserId: string | null;
  onLink: () => void; onUnlink: () => void;
}) {
  const [tab, setTab] = useState<"perfil" | "onboarding" | "procesos">("perfil");
  const [local, setLocal] = useState<Employee>(employee);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) { setUploadingPhoto(false); return; }
          try {
            const formData = new FormData();
            formData.append("file", blob, "photo.jpg");
            formData.append("bucket", "employee-photos");
            formData.append("name", `employee-${local.id}`);
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            if (!res.ok) throw new Error("Upload failed");
            const { url } = await res.json();
            setLocal(prev => ({ ...prev, imageUrl: url }));
          } catch {
            // silent — photo upload failed
          } finally {
            setUploadingPhoto(false);
          }
        }, "image/jpeg", 0.82);
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }, [local.id]);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [processes, setProcesses] = useState<{ id: string; name?: string; status?: string }[]>([]);
  const [processesLoaded, setProcessesLoaded] = useState(false);

  // Sincroniza el estado local con la prop cuando cambian campos del empleado.
  useEffect(() => { setLocal(employee); }, [employee]);
  // El reset a tab "perfil" solo ocurre cuando cambia EL empleado (cambio de id).
  // Antes resetear con cada actualización (e.g. toggle de onboarding) hacía que
  // el usuario perdiera la tab al tachar un paso.
  useEffect(() => { setTab("perfil"); }, [employee.id]);

  useEffect(() => {
    fetch("/api/divisions").then(r => r.ok ? r.json() : []).then(setDivisions).catch(() => {});
    fetch("/api/departments").then(r => r.ok ? r.json() : []).then(setAllDepartments).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "procesos" && !processesLoaded) {
      fetch(`/api/inbox?assignedTo=${employee.id}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => { setProcesses(Array.isArray(data) ? data : []); setProcessesLoaded(true); })
        .catch(() => setProcessesLoaded(true));
    }
  }, [tab, processesLoaded, employee.id]);

  const filteredDepartments = local.divisionId
    ? allDepartments.filter(d => d.divisionId === local.divisionId)
    : allDepartments;

  const divisionName = divisions.find(d => d.id === local.divisionId)?.name;
  const deptName = allDepartments.find(d => d.id === local.departmentId)?.name;
  const locationText = local.departmentId && local.divisionId
    ? `${deptName} · ${divisionName}`
    : local.divisionId && !local.departmentId
    ? `Secretario/a de ${divisionName}`
    : local.departmentId ? deptName : null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${local.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(local),
      });
      if (res.ok) onUpdated(await res.json());
    } finally { setSaving(false); }
  };

  const onboarding: OnboardingItem[] = local.metadata?.onboarding?.length
    ? local.metadata.onboarding : DEFAULT_ONBOARDING;
  const doneCount = onboarding.filter(i => i.done).length;
  const progressPct = onboarding.length > 0 ? (doneCount / onboarding.length) * 100 : 0;

  const toggleOnboarding = async (id: string) => {
    const updated = onboarding.map(item => item.id === id ? { ...item, done: !item.done } : item);
    const updatedEmp = { ...local, metadata: { ...local.metadata, onboarding: updated } };
    setLocal(updatedEmp);
    await fetch(`/api/employees/${local.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata: updatedEmp.metadata }) });
    onUpdated(updatedEmp);
  };

  const addCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    const newItem = { id: Date.now().toString(), label: newCheckItem.trim(), done: false };
    const updated = [...onboarding, newItem];
    const updatedEmp = { ...local, metadata: { ...local.metadata, onboarding: updated } };
    setLocal(updatedEmp); setNewCheckItem("");
    await fetch(`/api/employees/${local.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata: updatedEmp.metadata }) });
    onUpdated(updatedEmp);
  };

  // Drag-and-drop reorder de items de onboarding
  const reorderOnboarding = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...onboarding];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const updatedEmp = { ...local, metadata: { ...local.metadata, onboarding: next } };
    setLocal(updatedEmp);
    await fetch(`/api/employees/${local.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata: updatedEmp.metadata }) });
    onUpdated(updatedEmp);
  };
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  return (
    <div style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 500, backgroundColor: "#0E1220", borderLeft: "1px solid #1E2540", boxShadow: "-4px 0 32px rgba(0,0,0,0.5)", zIndex: 50, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #1E2540" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <Avatar name={local.fullName} color={local.color} size={52} imageUrl={local.imageUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input style={{ background: "none", border: "none", outline: "none", color: "#E2E8F8", fontSize: 18, fontWeight: 700, width: "100%", padding: 0, marginBottom: 2 }}
              value={local.fullName} onChange={e => setLocal({ ...local, fullName: e.target.value })} placeholder="Nombre completo" />
            <input style={{ background: "none", border: "none", outline: "none", color: "#7A8BAD", fontSize: 13, width: "100%", padding: 0 }}
              value={local.jobTitle || ""} onChange={e => setLocal({ ...local, jobTitle: e.target.value })} placeholder="Puesto" />
            {locationText && (
              <p style={{ color: "#3D7EFF", fontSize: 11, margin: "3px 0 0", fontWeight: 500, letterSpacing: "0.02em" }}>{locationText}</p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <StatusDropdown
              value={local.status}
              onChange={v => setLocal({ ...local, status: v })}
            />
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#7A8BAD", cursor: "pointer", padding: 4 }}><X size={16} /></button>
          </div>
        </div>
        {/* Link UI — vincular este puesto a la cuenta del usuario logueado */}
        {(() => {
          const isMine = myEmployeeId === employee.id;
          const linkedToOther = employee.userId && employee.userId !== myInternalUserId;
          if (isMine) {
            return (
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(61,126,255,0.08)", border: "1px solid rgba(61,126,255,0.3)", borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: "#3D7EFF", fontWeight: 600, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  ★ Tu puesto
                </span>
                <span style={{ fontSize: 11, color: "#7A8BAD", flex: 1 }}>
                  Las tareas de este puesto aparecen en &quot;Mi día&quot;.
                </span>
                <button onClick={onUnlink} style={{ fontSize: 10, padding: "3px 8px", background: "transparent", border: "1px solid #F43F5E55", color: "#F43F5E", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase" }}>
                  Desvincular
                </button>
              </div>
            );
          }
          if (linkedToOther && !isAdmin) {
            return (
              <div style={{ marginBottom: 14, padding: "7px 12px", background: "rgba(122,139,173,0.06)", border: "1px solid #1E2540", borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: "#7A8BAD" }}>Este puesto ya está vinculado a otra cuenta.</span>
              </div>
            );
          }
          return (
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(16,217,160,0.05)", border: "1px dashed rgba(16,217,160,0.3)", borderRadius: 6 }}>
              <span style={{ fontSize: 11, color: "#7A8BAD", flex: 1 }}>
                {linkedToOther ? "Vinculado a otra cuenta (admin puede sobrescribir)." : "¿Este es tu puesto?"}
              </span>
              <button onClick={onLink} style={{ fontSize: 11, padding: "4px 12px", background: "#10D9A0", border: "none", color: "#080B12", fontWeight: 600, borderRadius: 4, cursor: "pointer" }}>
                Soy yo
              </button>
            </div>
          );
        })()}

        {/* Tabs */}
        <div style={{ display: "flex" }}>
          {(["perfil", "onboarding", "procesos"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #3D7EFF" : "2px solid transparent", color: tab === t ? "#3D7EFF" : "#7A8BAD", fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize" }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {/* ── Perfil ── */}
        {tab === "perfil" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* División y Departamento */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>División</label>
                <select style={selectStyle} value={local.divisionId || ""}
                  onChange={e => setLocal({ ...local, divisionId: e.target.value || undefined, departmentId: undefined })}>
                  <option value="">Sin división</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Departamento</label>
                <select style={selectStyle} value={local.departmentId || ""}
                  onChange={e => setLocal({ ...local, departmentId: e.target.value || undefined })}>
                  <option value="">Sin departamento</option>
                  {filteredDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            {/* Email y Teléfono */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={local.email || ""} onChange={e => setLocal({ ...local, email: e.target.value })} placeholder="correo@empresa.com" /></div>
              <div><label style={labelStyle}>Teléfono</label><input style={inputStyle} value={local.phone || ""} onChange={e => setLocal({ ...local, phone: e.target.value })} placeholder="+54 11 0000-0000" /></div>
            </div>

            <div><label style={labelStyle}>Fecha de ingreso</label><input style={inputStyle} type="date" value={local.startDate ? local.startDate.slice(0, 10) : ""} onChange={e => setLocal({ ...local, startDate: e.target.value })} /></div>

            {/* Foto del empleado — upload local o URL pública */}
            <div>
              <label style={labelStyle}>Foto del puesto</label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); e.target.value = ""; }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {/* Avatar clickeable como zona de upload */}
                <div
                  onClick={() => photoInputRef.current?.click()}
                  title="Clic para subir foto"
                  style={{ position: "relative", cursor: "pointer", flexShrink: 0 }}
                >
                  <Avatar name={local.fullName} color={local.color} size={48} imageUrl={uploadingPhoto ? null : local.imageUrl} />
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center",
                    justifyContent: "center", opacity: 0, transition: "opacity 0.15s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                  >
                    {uploadingPhoto
                      ? <div style={{ width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                      : <Upload size={14} color="#fff" />
                    }
                  </div>
                </div>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  type="url"
                  value={local.imageUrl?.startsWith("data:") ? "" : (local.imageUrl || "")}
                  onChange={e => setLocal({ ...local, imageUrl: e.target.value || null })}
                  placeholder="https://… o hacé clic en el avatar para subir"
                />
                {local.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setLocal({ ...local, imageUrl: null })}
                    style={{ padding: "8px 10px", backgroundColor: "transparent", border: "1px solid #1E2540", borderRadius: 6, color: "#7A8BAD", cursor: "pointer" }}
                    title="Quitar foto"
                  ><X size={13} /></button>
                )}
              </div>
              <p style={{ fontSize: 10, color: "#7A8BAD", margin: "4px 0 0", fontFamily: "monospace" }}>
                Subí una foto (clic en el avatar) o pegá una URL pública. Se guarda al hacer clic en Guardar.
              </p>
            </div>

            <div>
              <label style={labelStyle}>Descripción del puesto</label>
              <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80, fontFamily: "inherit", lineHeight: 1.6 } as React.CSSProperties}
                value={local.description || ""} onChange={e => setLocal({ ...local, description: e.target.value })} placeholder="Responsabilidades y notas..." />
            </div>

            {isAdmin && (
              <div><label style={labelStyle}>Honorarios</label>
                <input style={inputStyle} type="number" min={0} value={local.salary ?? ""}
                  onChange={e => setLocal({ ...local, salary: e.target.value ? Number(e.target.value) : undefined })} placeholder="0" />
              </div>
            )}

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", backgroundColor: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                <Save size={14} />{saving ? "Guardando..." : "Guardar"}
              </button>
              <button onClick={() => onArchive(local)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", backgroundColor: "transparent", color: "#F43F5E", border: "1px solid #F43F5E40", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                <Archive size={14} />Archivar
              </button>
            </div>
          </div>
        )}

        {/* ── Onboarding ── */}
        {tab === "onboarding" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#7A8BAD", textTransform: "uppercase", letterSpacing: "0.06em" }}>Progreso</span>
                <span style={{ fontSize: 12, color: "#E2E8F8", fontWeight: 600 }}>{doneCount}/{onboarding.length}</span>
              </div>
              <div style={{ height: 4, backgroundColor: "#1E2540", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressPct}%`, backgroundColor: progressPct === 100 ? "#10D9A0" : "#3D7EFF", borderRadius: 4, transition: "width 0.3s ease" }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {onboarding.map((item, idx) => {
                const isDragging = dragIdx === idx;
                const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
                return (
                  <div
                    key={item.id}
                    draggable={isAdmin}
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={e => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={e => {
                      e.preventDefault();
                      if (dragIdx !== null) reorderOnboarding(dragIdx, idx);
                      setDragIdx(null); setDragOverIdx(null);
                    }}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                    onClick={() => toggleOnboarding(item.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px",
                      backgroundColor: item.done ? "#10D9A008" : "#141928",
                      border: `1px solid ${isDragOver ? "#3D7EFF" : item.done ? "#10D9A030" : "#1E2540"}`,
                      borderRadius: 6,
                      cursor: "pointer",
                      opacity: isDragging ? 0.4 : 1,
                      transform: isDragOver ? "translateY(2px)" : "translateY(0)",
                      transition: "transform 120ms ease, opacity 120ms ease, border 120ms ease",
                    }}
                  >
                    {isAdmin && (
                      <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{
                          display: "flex", flexDirection: "column", gap: 2,
                          padding: "0 2px",
                          cursor: "grab",
                          color: "#3A4560",
                          flexShrink: 0,
                        }}
                        title="Arrastrá para reordenar"
                      >
                        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />
                        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />
                        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />
                      </div>
                    )}
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: item.done ? "none" : "2px solid #1E2540", backgroundColor: item.done ? "#10D9A0" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {item.done && <Check size={11} color="#080B12" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 13, color: item.done ? "#7A8BAD" : "#E2E8F8", textDecoration: item.done ? "line-through" : "none", flex: 1 }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
            {isAdmin && (
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCheckItem(); } }}
                  placeholder="Agregar ítem personalizado..." />
                <button onClick={addCheckItem} style={{ padding: "0 14px", backgroundColor: "#141928", border: "1px solid #1E2540", borderRadius: 6, color: "#3D7EFF", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Procesos ── */}
        {tab === "procesos" && (
          <div>
            {!processesLoaded ? (
              <p style={{ color: "#7A8BAD", fontSize: 14 }}>Cargando...</p>
            ) : processes.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", border: "1px dashed #1E2540", borderRadius: 8 }}>
                <p style={{ color: "#7A8BAD", fontSize: 14, margin: "0 0 8px" }}>Sin historial de procesos.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {processes.slice(0, 10).map(p => (
                  <div key={p.id} style={{ padding: "10px 14px", backgroundColor: "#141928", border: "1px solid #1E2540", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#E2E8F8", fontSize: 13 }}>{p.name || p.id}</span>
                    {p.status && <span style={{ color: "#7A8BAD", fontSize: 12 }}>{p.status}</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <a href="/dashboard/inbox" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#3D7EFF", fontSize: 13, textDecoration: "none", fontWeight: 500 }}>
                Ver en bandeja <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const toast = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "division" | "dept">("division");
  // Filtros granulares (combinables con search). Por default sin filtro de estado:
  // muestra todos. El usuario activa el filtro que quiera.
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "on_leave">("all");
  const [divFilter, setDivFilter] = useState<string>("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  // ID del employee vinculado al user logueado (para mostrar chip "Tu puesto" + botón "Soy yo").
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  // internalUserId del current user (necesario para validar si un employee ya tiene OTRO usuario)
  const [myInternalUserId, setMyInternalUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Siempre traemos todos los empleados; el filtro por estado se aplica del lado cliente
      // vía statusFilter ('all' | 'active' | 'inactive' | 'on_leave').
      const [empRes, divRes, deptRes, meRes] = await Promise.all([
        fetch("/api/employees?includeInactive=true"), fetch("/api/divisions"), fetch("/api/departments"),
        fetch("/api/employees/me"),
      ]);
      if (empRes.ok) setEmployees(await empRes.json());
      if (divRes.ok) setDivisions(await divRes.json());
      if (deptRes.ok) setAllDepartments(await deptRes.json());
      if (meRes.ok) {
        const meData = await meRes.json();
        setMyEmployeeId(meData.employee?.id ?? null);
        setMyInternalUserId(meData.user?.id ?? null);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Vincular o desvincular este puesto a mi cuenta
  const handleLink = async (empId: string) => {
    const res = await fetch(`/api/employees/${empId}/link`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, userId: updated.userId } : e));
      // Si había otro empleado mío vinculado, desvincularlo en local también
      if (myEmployeeId && myEmployeeId !== empId) {
        setEmployees(prev => prev.map(e => e.id === myEmployeeId ? { ...e, userId: null } : e));
      }
      setMyEmployeeId(empId);
      toast.success("Puesto vinculado", "Tus tareas asignadas aparecen ahora en \"Mi día\".");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error("No se pudo vincular", err.error ?? "Verificá que el puesto no esté ocupado.");
    }
  };
  const handleUnlink = async (empId: string) => {
    const res = await fetch(`/api/employees/${empId}/link`, { method: "DELETE" });
    if (res.ok) {
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, userId: null } : e));
      if (myEmployeeId === empId) setMyEmployeeId(null);
    }
  };

  // Métricas para el header — un golpe de vista de la salud del equipo.
  const metrics = (() => {
    const active = employees.filter(e => e.status === "active" && e.fullName !== "[Puesto vacante]").length;
    const onLeave = employees.filter(e => e.status === "on_leave").length;
    const vacant = employees.filter(e => e.fullName === "[Puesto vacante]").length;
    const deptsWithStaff = new Set(
      employees.filter(e => e.departmentId).map(e => e.departmentId)
    ).size;
    return { active, onLeave, vacant, deptsWithStaff };
  })();

  // Filtros aplicados: search (libre) + status set + divisionId + departmentId
  const filtered = employees.filter(e => {
    // Búsqueda textual
    const q = search.toLowerCase();
    if (q) {
      const matchSearch =
        e.fullName.toLowerCase().includes(q) ||
        (e.jobTitle || "").toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    // Estado (si activo el filtro 'all' incluye todos; sino filtra al set elegido)
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    // División específica
    if (divFilter && e.divisionId !== divFilter) return false;
    // Departamento específico
    if (deptFilter && e.departmentId !== deptFilter) return false;
    return true;
  });

  const handleUpdated = (updated: Employee) => {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
    setSelected(updated);
  };

  // Group logic
  type Group = { label: string; color: string; employees: Employee[] };
  const getGroups = (): Group[] => {
    if (groupBy === "none") return [{ label: "Todos", color: "#3D7EFF", employees: filtered }];
    if (groupBy === "division") {
      const groups: Group[] = divisions.map(d => ({
        label: d.name, color: "#3D7EFF",
        employees: filtered.filter(e => e.divisionId === d.id),
      })).filter(g => g.employees.length > 0);
      const ungrouped = filtered.filter(e => !e.divisionId);
      if (ungrouped.length > 0) groups.push({ label: "Sin división", color: "#7A8BAD", employees: ungrouped });
      return groups;
    }
    // dept
    const groups: Group[] = allDepartments.map(d => ({
      label: d.name, color: "#3D7EFF",
      employees: filtered.filter(e => e.departmentId === d.id),
    })).filter(g => g.employees.length > 0);
    const ungrouped = filtered.filter(e => !e.departmentId);
    if (ungrouped.length > 0) groups.push({ label: "Sin departamento", color: "#7A8BAD", employees: ungrouped });
    return groups;
  };

  const groups = getGroups();

  return (
    <div style={{ height: "100%", minHeight: "calc(100vh - 56px)", backgroundColor: "#080B12", overflow: "hidden", position: "relative" }}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "24px 32px 16px", borderBottom: "1px solid #1E2540" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 10, letterSpacing: "0.1em", color: "#7A8BAD", textTransform: "uppercase", margin: "0 0 4px", fontFamily: "monospace" }}>Equipo</p>
                <h1 style={{ color: "#E2E8F8", fontSize: 20, fontWeight: 700, margin: 0 }}>Empleados</h1>
              </div>
              {/* Métricas inline */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <MetricChip color="#10D9A0" label="activos"   value={metrics.active} />
                {metrics.onLeave > 0 && <MetricChip color="#F59E0B" label="licencia"  value={metrics.onLeave} />}
                {metrics.vacant  > 0 && <MetricChip color="#7A8BAD" label="vacantes"  value={metrics.vacant}  />}
                {metrics.deptsWithStaff > 0 && <MetricChip color="#3D7EFF" label="deptos" value={metrics.deptsWithStaff} />}
              </div>
            </div>
            <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", backgroundColor: "#3D7EFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={14} />Nuevo
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#7A8BAD" }} />
              <input style={{ ...inputStyle, paddingLeft: 30, fontSize: 12 }} placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#7A8BAD", cursor: "pointer" }}><X size={12} /></button>}
            </div>
            {/* Estado: filtro detallado */}
            <FilterDropdown
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              label="Estado"
              accentColor={STATUS_COLORS[statusFilter] ?? "#3D7EFF"}
              options={[
                { v: "all",       label: "Todos los estados", color: "#7A8BAD" },
                { v: "active",    label: "Activo",    color: STATUS_COLORS.active },
                { v: "inactive",  label: "Inactivo",  color: STATUS_COLORS.inactive },
                { v: "on_leave",  label: "Licencia",  color: STATUS_COLORS.on_leave },
              ]}
            />
            {/* División: filtro por una específica */}
            <FilterDropdown
              value={divFilter}
              onChange={setDivFilter}
              label="División"
              options={[
                { v: "", label: "Todas las divisiones" },
                ...divisions.map(d => ({ v: d.id, label: d.name, color: "#3D7EFF" })),
              ]}
            />
            {/* Departamento: filtro por uno específico */}
            <FilterDropdown
              value={deptFilter}
              onChange={setDeptFilter}
              label="Departamento"
              options={[
                { v: "", label: "Todos los departamentos" },
                ...allDepartments.map(d => ({ v: d.id, label: d.name, color: "#C8902C" })),
              ]}
            />
            {/* Limpiar filtros (visible solo si hay alguno activo) */}
            {(statusFilter !== "all" || divFilter || deptFilter || search) && (
              <button
                onClick={() => { setStatusFilter("all"); setDivFilter(""); setDeptFilter(""); setSearch(""); }}
                style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "1px solid #F43F5E40", background: "transparent", color: "#F43F5E", cursor: "pointer" }}
              >
                Limpiar filtros
              </button>
            )}
            {/* Group by — secundario, separado */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 3, background: "#0E1220", border: "1px solid #1E2540", borderRadius: 20, padding: 3 }}>
              <span style={{ padding: "3px 8px", fontSize: 10, color: "#7A8BAD", fontFamily: "monospace", textTransform: "uppercase", display: "flex", alignItems: "center" }}>Agrupar:</span>
              {([["none", "—"], ["division", "División"], ["dept", "Depto"]] as [typeof groupBy, string][]).map(([val, lbl]) => (
                <button key={val} onClick={() => setGroupBy(val)} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "none", cursor: "pointer", background: groupBy === val ? "#1E2540" : "transparent", color: groupBy === val ? "#E2E8F8" : "#7A8BAD" }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#7A8BAD", fontSize: 14 }}>Cargando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#7A8BAD", fontSize: 14 }}>{search ? "Sin resultados." : "Sin empleados aún."}</div>
          ) : groups.map(group => (
            <div key={group.label}>
              {/* Group header */}
              {groupBy !== "none" && (
                <div style={{ padding: "10px 32px 6px", borderBottom: "1px solid #1E2540", background: "#0A0E1A", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: group.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#E2E8F8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{group.label}</span>
                  <span style={{ fontSize: 10, color: "#7A8BAD", background: "#141928", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{group.employees.length}</span>
                </div>
              )}
              {group.employees.map(emp => {
                const isSelected = selected?.id === emp.id;
                const vacant = isVacant(emp);
                // En puesto vacante mostramos el jobTitle como título (la posición es lo importante)
                // y omitimos el "[Puesto vacante]" duplicado.
                const primary = vacant ? (emp.jobTitle || "Puesto sin definir") : emp.fullName;
                const secondary = vacant ? "Vacante — buscar candidato" : (emp.jobTitle || "Sin puesto definido");
                return (
                  <div key={emp.id} onClick={() => setSelected(isSelected ? null : emp)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 32px", cursor: "pointer", backgroundColor: isSelected ? "#141928" : "transparent", borderLeft: isSelected ? "3px solid #3D7EFF" : "3px solid transparent", borderBottom: "1px solid #1E254040", transition: "background 0.15s", opacity: vacant ? 0.78 : 1 }}>
                    <Avatar name={emp.fullName} color={emp.color} size={38} imageUrl={emp.imageUrl} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: vacant ? "#7A8BAD" : "#E2E8F8", fontSize: 14, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: vacant ? "italic" : "normal" }}>{primary}</p>
                      <p style={{ color: "#7A8BAD", fontSize: 12, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{secondary}</p>
                    </div>
                    {vacant ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, backgroundColor: "#7A8BAD20", color: "#7A8BAD", border: "1px dashed #7A8BAD60" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#7A8BAD" }} />
                        Vacante
                      </span>
                    ) : (
                      <StatusBadge status={emp.status} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 32px", borderTop: "1px solid #1E2540" }}>
          <p style={{ color: "#7A8BAD", fontSize: 12, margin: 0 }}>
            {loading ? "—" : `${filtered.length} empleado${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* ── Overlay backdrop + panel ── */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 49 }} />
          <EmployeePanel
            key={selected.id}
            employee={selected}
            onClose={() => setSelected(null)}
            onUpdated={handleUpdated}
            onArchive={emp => setArchiveTarget(emp)}
            isAdmin={isAdmin}
            myEmployeeId={myEmployeeId}
            myInternalUserId={myInternalUserId}
            onLink={() => handleLink(selected.id)}
            onUnlink={() => handleUnlink(selected.id)}
          />
        </>
      )}

      {/* Modals */}
      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onCreated={fetchAll} />}
      {archiveTarget && <ArchiveModal employee={archiveTarget} onClose={() => setArchiveTarget(null)} onArchived={() => { fetchAll(); setSelected(null); }} />}
    </div>
  );
}
