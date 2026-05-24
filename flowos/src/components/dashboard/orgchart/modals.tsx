"use client";

import { useMemo, useState } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import type { Employee } from "@/db/schema";
import type { Division, Department } from "./types";
import { ColorPicker } from "./ColorPicker";

// Helper: handler que cierra el modal SOLO si el mousedown empezó directamente
// sobre el backdrop (no en un child como un input).
// Evita el bug: seleccionar texto en un input → mouseup termina en backdrop → onClick
// se disparaba con e.target=backdrop → modal cerraba.
// Con onMouseDown, el evento sólo se dispara cuando el press inicial cae sobre el
// elemento (no sube por bubbling de inputs).
function backdropClose(onClose: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}

// Estilos compartidos entre modales (formularios oscuros)
const fieldStyle: React.CSSProperties = {
  width: "100%", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)",
  borderRadius: 6, color: "var(--c-text-primary)", fontSize: 13, padding: "7px 10px",
  outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--c-text-muted)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: 4, fontFamily: "monospace",
};

// ─── Person Picker ───────────────────────────────────────────────────────────

export function PersonPickerModal({ employees, onPick, onClose, onClearAssignment }: {
  employees: Employee[];
  onPick: (emp: Employee) => void;
  onClose: () => void;
  onClearAssignment: () => void;
}) {
  const [search, setSearch] = useState("");
  const candidates = employees.filter(e =>
    e.fullName !== "[Puesto vacante]" &&
    e.fullName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
      {...backdropClose(onClose)}>
      <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 10, width: 480, maxHeight: "75vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>Asignar persona al puesto</p>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 12, borderBottom: "1px solid var(--c-border)" }}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empleado..."
            style={{ width: "100%", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--c-text-primary)", outline: "none" }}
          />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {candidates.length === 0 ? (
            <p style={{ padding: "24px", textAlign: "center", color: "var(--c-text-muted)", fontSize: 12 }}>Sin coincidencias</p>
          ) : (
            candidates.map(e => {
              const initials = e.fullName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
              const monthsAtCompany = e.startDate ? Math.max(0, Math.floor((Date.now() - new Date(e.startDate).getTime()) / (30 * 86400000))) : null;
              const tenure = monthsAtCompany === null ? "Sin fecha de ingreso" :
                monthsAtCompany < 1 ? "Recién ingresado" :
                monthsAtCompany < 12 ? `${monthsAtCompany} mes${monthsAtCompany === 1 ? "" : "es"}` :
                `${(monthsAtCompany / 12).toFixed(1)} años`;
              return (
                <button
                  key={e.id}
                  onClick={() => { onPick(e); onClose(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "10px 12px", background: "transparent", border: "none",
                    borderRadius: 6, cursor: "pointer", textAlign: "left", marginBottom: 2,
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = "var(--c-bg-elevated)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: (e.color ?? "var(--c-accent-blue)") + "33",
                    border: `2px solid ${e.color ?? "var(--c-accent-blue)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 600, color: e.color ?? "var(--c-accent-blue)",
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.fullName}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.jobTitle ?? "Sin puesto"} · {tenure}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--c-border)", display: "flex", gap: 8 }}>
          <button onClick={() => { onClearAssignment(); onClose(); }}
            style={{ flex: 1, padding: "7px 12px", background: "transparent", border: "1px solid var(--c-border)", borderRadius: 6, color: "var(--c-accent-red)", fontSize: 12, cursor: "pointer" }}>
            Dejar puesto vacante
          </button>
          <button onClick={onClose}
            style={{ flex: 1, padding: "7px 12px", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6, color: "var(--c-text-muted)", fontSize: 12, cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Position Modal ──────────────────────────────────────────────────────

export type NewPositionParent =
  | { kind: "division"; id: string; name: string; color: string }
  | { kind: "department"; id: string; name: string; color: string }
  | { kind: "employee"; id: string; fullName: string; jobTitle: string; color: string }
  | null;

export function NewPositionModal({ parent, employees, departments, defaultColor, onCreate, onClose }: {
  parent: NewPositionParent;
  employees: Employee[];
  departments: Department[];
  defaultColor: string;
  onCreate: (data: {
    jobTitle: string; fullName: string; color: string;
    description?: string; salary?: string; email?: string; phone?: string; startDate?: string;
    assignedEmployeeId?: string;
    reportsToId?: string;
    role?: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [jobTitle, setJobTitle] = useState("");
  const [color, setColor] = useState(defaultColor);
  const [description, setDescription] = useState("");
  const [salary, setSalary] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [assignedEmpId, setAssignedEmpId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Tipo de puesto opcional. "" = auto-detect, "director"|"manager"|"member" = override.
  const [role, setRole] = useState<string>("");

  const getDefaultReportsTo = (): string | null => {
    if (parent?.kind === "employee") return parent.id;
    if (parent?.kind === "department") {
      const dept = departments.find(d => d.id === parent.id);
      return dept?.headEmployeeId ?? null;
    }
    return null;
  };
  const [reportsToId, setReportsToId] = useState<string | null>(getDefaultReportsTo());

  const reportsToCandidates = useMemo(() => {
    if (!parent) return [];
    if (parent.kind === "department") {
      return employees.filter(e => e.departmentId === parent.id);
    }
    if (parent.kind === "division") {
      return employees.filter(e =>
        e.divisionId === parent.id ||
        departments.some(d => d.divisionId === parent.id && d.id === e.departmentId)
      );
    }
    if (parent.kind === "employee") {
      const boss = employees.find(e => e.id === parent.id);
      if (boss?.departmentId) return employees.filter(e => e.departmentId === boss.departmentId);
      return [boss].filter(Boolean) as Employee[];
    }
    return [];
  }, [parent, employees, departments]);

  const assignedEmp = employees.find(e => e.id === assignedEmpId);
  const assignedName = assignedEmp?.fullName ?? "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        jobTitle: jobTitle.trim(),
        fullName: assignedName || "[Puesto vacante]",
        color,
        description: description.trim() || undefined,
        salary: salary.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        startDate: startDate || undefined,
        assignedEmployeeId: assignedEmpId ?? undefined,
        reportsToId: reportsToId ?? undefined,
        role: role || undefined,
      });
      onClose();
    } finally { setSaving(false); }
  };

  // Label contextual: muestra exactamente DÓNDE va a quedar el puesto nuevo.
  // Distingue: suelto, en división, en depto dentro de división, en depto suelto, o subordinado.
  const parentLabel = (() => {
    if (!parent) return "📍 Suelto, sin contenedor";
    if (parent.kind === "division") return `📍 Dentro de la división "${parent.name}"`;
    if (parent.kind === "department") {
      const dept = departments.find(d => d.id === parent.id);
      if (dept?.divisionId) {
        return `📍 Dentro del depto "${parent.name}" (en una división)`;
      }
      return `📍 Dentro del depto "${parent.name}" (suelto)`;
    }
    return `📍 Reporta a · ${parent.fullName} (${parent.jobTitle})`;
  })();

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
        {...backdropClose(onClose)}>
        <div style={{
          width: "100%", maxWidth: 520, maxHeight: "88vh",
          background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 12,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 20px 60px var(--c-shadow-heavy)",
        }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--c-text-primary)", margin: 0 }}>Nuevo puesto</p>
              <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "2px 0 0", fontFamily: "monospace" }}>
                {parentLabel}
              </p>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={submit} style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Puesto <span style={{ color: "var(--c-accent-red)" }}>*</span></label>
              <input autoFocus value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                placeholder="ej: Gerente de Ventas" style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Color del puesto</label>
              <ColorPicker value={color} onChange={setColor} />
              <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
                {parent?.kind === "employee" ? "Sugerido: el color del jefe" : "Elegí un color para identificar visualmente"}
              </p>
            </div>

            <div>
              <label style={labelStyle}>Tipo de puesto</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                style={{ ...fieldStyle, cursor: "pointer" }}>
                <option value="">Auto (detectar por jerarquía)</option>
                <option value="director">Director</option>
                <option value="manager">Encargado</option>
                <option value="member">Miembro</option>
              </select>
              <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
                Auto: director = head del depto, encargado = tiene subordinados
              </p>
            </div>

            <div>
              <label style={labelStyle}>Asignar persona (opcional)</label>
              <button type="button" onClick={() => setShowPicker(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6,
                  padding: "7px 10px", cursor: "pointer", textAlign: "left",
                }}>
                {assignedEmpId ? (
                  <>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: `${assignedEmp?.color ?? color}33`,
                      border: `2px solid ${assignedEmp?.color ?? color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 600, color: assignedEmp?.color ?? color,
                      flexShrink: 0,
                    }}>
                      {assignedName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--c-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {assignedName}
                    </span>
                    <button type="button" onClick={e => { e.stopPropagation(); setAssignedEmpId(null); }}
                      style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>Click para seleccionar empleado…</span>
                )}
              </button>
              <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
                Si no asignás a nadie, queda vacante hasta que se cubra
              </p>
            </div>

            {reportsToCandidates.length > 0 && (
              <div>
                <label style={labelStyle}>Reporta a</label>
                <select value={reportsToId ?? ""} onChange={e => setReportsToId(e.target.value || null)}
                  style={{ ...fieldStyle, cursor: "pointer" }}>
                  <option value="">— Sin jefe directo (top-level) —</option>
                  {reportsToCandidates.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName === "[Puesto vacante]" ? `${emp.jobTitle ?? "Sin puesto"} (vacante)` : `${emp.fullName} · ${emp.jobTitle ?? ""}`}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
                  Define la jerarquía y la posición visual (DIR → ENC → equipo)
                </p>
              </div>
            )}

            <div>
              <label style={labelStyle}>Descripción</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Responsabilidades del puesto…"
                style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Salario / honorarios</label>
                <input value={salary} onChange={e => setSalary(e.target.value)}
                  placeholder="ej: 1200000" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Fecha de ingreso</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={{ ...fieldStyle, colorScheme: "dark" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="ana@empresa.com" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+54 11 0000-0000" style={fieldStyle} />
              </div>
            </div>
          </form>

          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--c-border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} type="button"
              style={{ background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={submit} disabled={!jobTitle.trim() || saving}
              style={{
                background: "var(--c-accent-blue)", color: "#fff", border: "none", borderRadius: 6,
                padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                opacity: !jobTitle.trim() || saving ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}>
              {saving && <Loader2 size={13} className="animate-spin" />}
              Crear puesto
            </button>
          </div>
        </div>
      </div>

      {showPicker && (
        <PersonPickerModal
          employees={employees}
          onPick={picked => setAssignedEmpId(picked.id)}
          onClearAssignment={() => setAssignedEmpId(null)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

// ─── Division Edit Modal ─────────────────────────────────────────────────────

export function DivisionEditModal({ division, employees, onSave, onDelete, onClose }: {
  division: Division;
  employees: Employee[];
  onSave: (updates: Partial<Division>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(division.name);
  const [subtitle, setSubtitle] = useState(division.subtitle ?? "");
  const [color, setColor] = useState(division.color ?? "var(--c-accent-blue)");
  const [showFooter, setShowFooter] = useState(division.showFooter);
  const [footerText, setFooterText] = useState(division.footerText ?? "");
  const [seniorId, setSeniorId] = useState<string | null>(division.seniorEmployeeId ?? null);
  const [isConnectable, setIsConnectable] = useState<boolean>(division.isConnectable !== false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const seniorEmp = seniorId ? employees.find(e => e.id === seniorId) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        subtitle: subtitle.trim() || null,
        color,
        showFooter,
        footerText: footerText.trim() || null,
        seniorEmployeeId: seniorId,
        isConnectable,
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
      {...backdropClose(onClose)}>
      <div style={{
        width: "100%", maxWidth: 480,
        background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 12,
        boxShadow: "0 20px 60px var(--c-shadow-heavy)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text-primary)", margin: 0 }}>Editar división</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <form onSubmit={submit} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Título</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Subtítulo</label>
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)}
              placeholder="ej: COMERCIAL, OPERACIONES, R&D…" style={fieldStyle} />
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
              Aparece debajo del título — dejá vacío para no mostrar
            </p>
          </div>
          <div>
            <label style={labelStyle}>Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div>
            <label style={labelStyle}>Senior de la división</label>
            <button type="button" onClick={() => setShowPicker(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "7px 10px", cursor: "pointer", textAlign: "left" }}>
              {seniorEmp ? (
                <>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: (seniorEmp.color ?? color) + "33",
                    border: `2px solid ${seniorEmp.color ?? color}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: seniorEmp.color ?? color,
                    flexShrink: 0,
                  }}>
                    {seniorEmp.fullName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--c-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {seniorEmp.fullName} {seniorEmp.jobTitle && <span style={{ color: "var(--c-text-muted)" }}>· {seniorEmp.jobTitle}</span>}
                  </span>
                  <button type="button" onClick={ev => { ev.stopPropagation(); setSeniorId(null); }}
                    style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
                    <X size={13} />
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>Click para asignar el director/senior…</span>
              )}
            </button>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
              Aparece en la esquina superior del header
            </p>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--c-text-secondary)", fontSize: 13 }}>
              <input type="checkbox" checked={isConnectable} onChange={e => setIsConnectable(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: color }} />
              Permitir conectar líneas a esta división
            </label>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0 24px", fontFamily: "monospace" }}>
              Apagado = no se pueden crear edges hacia/desde esta división
            </p>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--c-text-secondary)", fontSize: 13 }}>
              <input type="checkbox" checked={showFooter} onChange={e => setShowFooter(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: color }} />
              Mostrar pie de página en la división
            </label>
            {showFooter && (
              <textarea
                value={footerText}
                onChange={e => setFooterText(e.target.value)}
                placeholder="Texto del pie (ej: 'Reporta a la junta directiva')"
                rows={2}
                style={{ ...fieldStyle, marginTop: 8, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
            <button type="button" onClick={onDelete}
              style={{ background: "transparent", color: "var(--c-accent-red)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.3)", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <Trash2 size={12} />
              Eliminar
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose}
                style={{ background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
                Cancelar
              </button>
              <button type="submit" disabled={!name.trim() || saving}
                style={{ background: "var(--c-accent-blue)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !name.trim() || saving ? 0.5 : 1 }}>
                {saving ? "..." : "Guardar"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showPicker && (
        <PersonPickerModal
          employees={employees}
          onPick={emp => setSeniorId(emp.id)}
          onClearAssignment={() => setSeniorId(null)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Department Edit Modal ───────────────────────────────────────────────────

export function DepartmentEditModal({ department, employees, onSave, onClose }: {
  department: Department;
  employees: Employee[];
  onSave: (updates: Partial<Department>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(department.name);
  const [color, setColor] = useState(department.color ?? "#C8902C");
  const [headId, setHeadId] = useState<string | null>(department.headEmployeeId ?? null);
  const [promoteHead, setPromoteHead] = useState<boolean>(department.promoteHead ?? false);
  const [layoutMode, setLayoutMode] = useState<string>(department.layoutMode ?? "vertical");
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const headEmp = headId ? employees.find(e => e.id === headId) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        color,
        headEmployeeId: headId,
        promoteHead,
        layoutMode,
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
      {...backdropClose(onClose)}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 12, boxShadow: "0 20px 60px var(--c-shadow-heavy)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text-primary)", margin: 0 }}>Editar departamento</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <form onSubmit={submit} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div>
            <label style={labelStyle}>Encargado del departamento</label>
            <button type="button" onClick={() => setShowPicker(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "7px 10px", cursor: "pointer", textAlign: "left" }}>
              {headEmp ? (
                <>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: (headEmp.color ?? color) + "33", border: `2px solid ${headEmp.color ?? color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: headEmp.color ?? color, flexShrink: 0 }}>
                    {headEmp.fullName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--c-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {headEmp.fullName} {headEmp.jobTitle && <span style={{ color: "var(--c-text-muted)" }}>· {headEmp.jobTitle}</span>}
                  </span>
                  <button type="button" onClick={ev => { ev.stopPropagation(); setHeadId(null); }}
                    style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer" }}>
                    <X size={13} />
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>Click para asignar encargado…</span>
              )}
            </button>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
              Aparece en el header del departamento
            </p>
          </div>

          {/* Promover head: si está activo, el head se renderiza como tarjeta arriba del depto */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--c-text-secondary)", fontSize: 13 }}>
              <input type="checkbox" checked={promoteHead} onChange={e => setPromoteHead(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: color }} />
              Mostrar al head arriba del departamento
            </label>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0 24px", fontFamily: "monospace" }}>
              Por defecto el director queda dentro del depto. Activar para promoverlo arriba.
            </p>
          </div>

          {/* Modo de layout interno */}
          <div>
            <label style={labelStyle}>Modo de layout interno</label>
            <select value={layoutMode} onChange={e => setLayoutMode(e.target.value)}
              style={{ ...fieldStyle, cursor: "pointer" }}>
              <option value="vertical">Vertical — clásico, indent por nivel</option>
              <option value="compact">Compacto — tarjetas chicas, sin indent</option>
              <option value="manual">Manual — sin auto-posición, drag libre</option>
            </select>
            <p style={{ fontSize: 10, color: "var(--c-text-muted)", margin: "4px 0 0", fontFamily: "monospace" }}>
              Cambia cómo se acomodan los puestos dentro del depto.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="submit" disabled={!name.trim() || saving} style={{ background: "var(--c-accent-blue)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !name.trim() || saving ? 0.5 : 1 }}>
              {saving ? "..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
      {showPicker && (
        <PersonPickerModal
          employees={employees}
          onPick={emp => setHeadId(emp.id)}
          onClearAssignment={() => setHeadId(null)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Quick prompt modal ──────────────────────────────────────────────────────

export function QuickPromptModal({ title, placeholder, initialValue, onConfirm, onClose }: {
  title: string; placeholder?: string; initialValue?: string;
  onConfirm: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onConfirm(value.trim());
      onClose();
    } finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
      {...backdropClose(onClose)}>
      <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 8, padding: 20, width: 380 }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: "0 0 12px" }}>{title}</p>
        <input autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          placeholder={placeholder}
          style={{ width: "100%", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--c-text-primary)", outline: "none", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} style={{ background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={!value.trim() || saving}
            style={{ background: "var(--c-accent-blue)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !value.trim() || saving ? 0.5 : 1 }}>
            {saving ? "..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rename modal (small inline rename) ──────────────────────────────────────

export function RenameModal({ initialValue, title, onSave, onClose }: {
  initialValue: string; title: string; onSave: (v: string) => Promise<void>; onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--c-shadow-strong)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 8, padding: 20, width: 360 }} onClick={e => e.stopPropagation()}>
        <p className="mb-3 font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>{title}</p>
        <input autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && value.trim()) {
              setSaving(true);
              onSave(value.trim()).finally(() => { setSaving(false); onClose(); });
            }
            if (e.key === "Escape") onClose();
          }}
          className="w-full rounded px-3 py-2 text-sm outline-none mb-3"
          style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs" style={{ background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" }}>Cancelar</button>
          <button onClick={() => { setSaving(true); onSave(value.trim()).finally(() => { setSaving(false); onClose(); }); }}
            disabled={!value.trim() || saving}
            className="rounded px-3 py-1.5 text-xs text-white disabled:opacity-50"
            style={{ background: "var(--c-accent-blue)" }}>
            {saving ? "..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
