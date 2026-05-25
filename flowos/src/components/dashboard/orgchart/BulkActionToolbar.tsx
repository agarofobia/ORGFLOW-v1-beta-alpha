"use client";

// Toolbar flotante que aparece cuando hay 2+ empleados seleccionados en el
// orgchart. Permite cambiar manager, depto, unidad, status o color en masa.

import { useEffect, useState } from "react";
import { Users, X, ChevronDown, Loader2, Check } from "lucide-react";

interface EmployeeLite {
  id: string;
  fullName: string;
  departmentId: string | null;
  divisionId: string | null;
}

interface BulkActionToolbarProps {
  selectedIds: string[];
  selectedEmployees: EmployeeLite[];
  allEmployees: EmployeeLite[];
  departments: Array<{ id: string; name: string }>;
  divisions: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string; departmentId: string }>;
  onApplied: () => void;
  onClear: () => void;
}

type ActionType = "manager" | "department" | "unit" | "status" | null;

export default function BulkActionToolbar({
  selectedIds,
  selectedEmployees,
  allEmployees,
  departments,
  divisions: _divisions,
  units,
  onApplied,
  onClear,
}: BulkActionToolbarProps) {
  void _divisions;
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => setDone(false), 1500);
      return () => clearTimeout(t);
    }
  }, [done]);

  if (selectedIds.length < 2) return null;

  const applyUpdate = async (updates: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/employees/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: selectedIds, updates }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: "Error" }));
        alert(data.error ?? "No se pudo actualizar");
        return;
      }
      setDone(true);
      setActiveAction(null);
      onApplied();
    } finally {
      setBusy(false);
    }
  };

  // Para "Cambiar manager", el manager debe ser un employee que NO esté en la selección
  const eligibleManagers = allEmployees.filter((e) => !selectedIds.includes(e.id));

  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        background: "var(--c-bg-surface)",
        border: "1px solid var(--c-accent-blue)",
        borderRadius: 12,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 12px 36px rgb(var(--c-accent-blue-rgb) / 0.32), 0 0 0 1px rgb(var(--c-accent-blue-rgb) / 0.08) inset",
        animation: "flo-fade-in-up 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
        maxWidth: "calc(100vw - 32px)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: "rgb(var(--c-accent-blue-rgb) / 0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Users size={14} style={{ color: "var(--c-accent-blue)" }} />
        </div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)" }}>
          {selectedIds.length} seleccionados
        </p>
      </div>

      <div style={{ width: 1, height: 20, background: "var(--c-border)" }} />

      {/* Action buttons */}
      <ActionButton label="Mover a depto" active={activeAction === "department"} onClick={() => setActiveAction(activeAction === "department" ? null : "department")} />
      <ActionButton label="Cambiar manager" active={activeAction === "manager"} onClick={() => setActiveAction(activeAction === "manager" ? null : "manager")} />
      <ActionButton label="Unidad" active={activeAction === "unit"} onClick={() => setActiveAction(activeAction === "unit" ? null : "unit")} />
      <ActionButton label="Estado" active={activeAction === "status"} onClick={() => setActiveAction(activeAction === "status" ? null : "status")} />

      {done && (
        <span style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 12, color: "var(--c-accent-emerald)",
          padding: "0 8px",
        }}>
          <Check size={12} /> Aplicado
        </span>
      )}

      {busy && <Loader2 size={14} className="animate-spin" style={{ color: "var(--c-accent-blue)" }} />}

      <button
        onClick={onClear}
        title="Deseleccionar todo"
        aria-label="Deseleccionar todo"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--c-text-muted)",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        <X size={14} />
      </button>

      {/* Pickers expandibles */}
      {activeAction === "department" && (
        <Picker
          title="Mover a departamento"
          items={[{ id: "__null__", name: "Sin departamento" }, ...departments]}
          onPick={(id) => applyUpdate({ departmentId: id === "__null__" ? null : id })}
        />
      )}
      {activeAction === "manager" && (
        <Picker
          title="Cambiar manager"
          items={[{ id: "__null__", name: "Sin manager" }, ...eligibleManagers.map((e) => ({ id: e.id, name: e.fullName }))]}
          onPick={(id) => applyUpdate({ managerId: id === "__null__" ? null : id })}
        />
      )}
      {activeAction === "unit" && (
        <Picker
          title="Asignar unidad"
          items={[{ id: "__null__", name: "Sin unidad" }, ...units.map((u) => {
            const dept = departments.find((d) => d.id === u.departmentId);
            return { id: u.id, name: `${u.name}${dept ? ` (${dept.name})` : ""}` };
          })]}
          onPick={(id) => applyUpdate({ unitId: id === "__null__" ? null : id })}
        />
      )}
      {activeAction === "status" && (
        <Picker
          title="Cambiar estado"
          items={[
            { id: "active", name: "Activo" },
            { id: "on_leave", name: "Licencia" },
            { id: "inactive", name: "Inactivo" },
          ]}
          onPick={(id) => applyUpdate({ status: id })}
        />
      )}
    </div>
  );

  void selectedEmployees;
}

function ActionButton({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 10px",
        background: active ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-elevated)",
        border: `1px solid ${active ? "rgb(var(--c-accent-blue-rgb) / 0.4)" : "var(--c-border)"}`,
        borderRadius: 6,
        fontSize: 12,
        color: active ? "var(--c-accent-blue)" : "var(--c-text-secondary)",
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <ChevronDown size={11} />
    </button>
  );
}

function Picker({
  title, items, onPick,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  onPick: (id: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--c-bg-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: 8,
        padding: 4,
        minWidth: 220,
        maxHeight: 280,
        overflowY: "auto",
        boxShadow: "0 12px 32px var(--c-shadow-medium)",
        animation: "flo-fade-in-up 180ms cubic-bezier(0.22, 1, 0.36, 1) both",
      }}
    >
      <p style={{
        margin: 0, padding: "4px 10px 6px",
        fontSize: 10, color: "var(--c-text-muted)",
        textTransform: "uppercase", letterSpacing: "0.06em",
        fontFamily: "monospace", fontWeight: 600,
      }}>
        {title}
      </p>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onPick(it.id)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "6px 10px",
            background: "transparent",
            border: "none",
            color: "var(--c-text-primary)",
            fontSize: 12.5,
            cursor: "pointer",
            borderRadius: 4,
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
}
