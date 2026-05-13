"use client";

import { useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import type { Employee, Unit } from "@/db/schema";
import type { Division, Department, EmployeeNode } from "./types";
import { ColorPicker } from "./ColorPicker";
import { PersonPickerModal } from "./modals";
import { roleLabelLong } from "./roles";

// sectionName es un campo del schema (employees.section_name) que aún no se usa
// en otros sitios. Por eso lo intersectamos acá para que el panel pueda editarlo.
export type EmployeeWithSection = Employee & { sectionName?: string | null };

export function NodeInfoPanel({
  node, employees, divisions, departments, units, isAdmin, onSave, onClose,
}: {
  node: EmployeeNode;
  employees: Employee[];
  divisions: Division[];
  departments: Department[];
  units: Unit[];
  isAdmin: boolean;
  onSave: (id: string, updates: Partial<EmployeeWithSection>) => Promise<void>;
  onClose: () => void;
}) {
  const emp = employees.find(e => e.id === node.id) as EmployeeWithSection | undefined;
  // Estado inicializado desde props; el componente se remonta con key={node.id}
  // por el parent al cambiar de nodo seleccionado → resetea campos automáticamente.
  const [fullName, setFullName] = useState(emp?.fullName ?? node.data.fullName);
  const [jobTitle, setJobTitle] = useState(emp?.jobTitle ?? node.data.jobTitle);
  const [description, setDescription] = useState(emp?.description ?? "");
  const [color, setColor] = useState(emp?.color ?? node.data.color ?? "#3D7EFF");
  const [divisionId, setDivisionId] = useState(emp?.divisionId ?? "");
  const [departmentId, setDepartmentId] = useState(emp?.departmentId ?? "");
  const [sectionName, setSectionName] = useState(emp?.sectionName ?? "");
  // role: "" = auto (no override), o "director"/"manager"/"member" = override manual
  const [role, setRole] = useState<string>(emp?.role ?? "");
  // unitId: "" = sin unidad asignada
  const [unitId, setUnitId] = useState<string>(emp?.unitId ?? "");
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const isVacant = fullName === "[Puesto vacante]";

  // Unidades disponibles para asignar: las del depto actualmente seleccionado.
  const availableUnits = units.filter(u => u.departmentId === departmentId);

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
        role: role || null,
        unitId: unitId || null,
      });
    } finally { setSaving(false); }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", background: "#141928", border: "1px solid #1E2540",
    borderRadius: 6, color: "#E2E8F8", fontSize: 13, padding: "7px 10px",
    outline: "none", boxSizing: "border-box",
  };

  const initials = isVacant
    ? "?"
    : fullName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

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

          {/* Persona asignada — abre picker */}
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

          {isAdmin && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Color del puesto</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          )}

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

          {/* Tipo de puesto — override manual del rol */}
          {isAdmin && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Tipo de puesto</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                style={{ ...fieldStyle, cursor: "pointer" }}>
                <option value="">Auto (detectar por jerarquía)</option>
                <option value="director">{roleLabelLong.director}</option>
                <option value="manager">{roleLabelLong.manager}</option>
                <option value="member">{roleLabelLong.member}</option>
              </select>
              <p style={{ fontSize: 10, color: "#7A8BAD", margin: "4px 0 0", fontFamily: "monospace" }}>
                Auto: director = head del depto, encargado = tiene subordinados
              </p>
            </div>
          )}

          {/* Unidad (sub-grupo dentro del depto) */}
          {isAdmin && departmentId && availableUnits.length > 0 && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Unidad</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}
                style={{ ...fieldStyle, cursor: "pointer" }}>
                <option value="">Sin unidad (cuelga del director)</option>
                {availableUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {isAdmin && departmentId && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "#7A8BAD" }}>Sección</label>
              <input value={sectionName} onChange={e => setSectionName(e.target.value)}
                placeholder="ej: Norte, Marketing digital..." style={fieldStyle} />
            </div>
          )}

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
            // adopta el color del picked si el actual es el genérico azul
            if (color === "#3D7EFF" && picked.color) setColor(picked.color);
          }}
          onClearAssignment={() => setFullName("[Puesto vacante]")}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
