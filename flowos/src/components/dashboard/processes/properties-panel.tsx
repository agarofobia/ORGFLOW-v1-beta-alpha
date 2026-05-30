"use client";

// Panel lateral de propiedades del nodo seleccionado en el editor BPM:
// nombre, descripción, puesto responsable (userTask), service action, etc.
import { useEffect, useState } from "react";
import { X, LayoutTemplate } from "lucide-react";
import type { BpmData, BpmNode } from "./process-flow";

// ─── Hook puestos del organigrama ─────────────────────────────────────────────

export type OrgPosition = { id: string; fullName: string; jobTitle: string };

export function useOrgPositions() {
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.ok ? r.json() : [])
      .then((data: OrgPosition[]) => {
        if (Array.isArray(data)) setPositions(data);
      })
      .catch(() => {});
  }, []);
  return positions;
}

export function PropertiesPanel({
  node,
  onUpdate,
  onClose,
  onOpenLayoutBuilder,
}: {
  node: BpmNode;
  onUpdate: (id: string, data: Partial<BpmData>) => void;
  onClose: () => void;
  onOpenLayoutBuilder: () => void;
}) {
  const positions = useOrgPositions();

  // Agrupar posiciones por puesto (job title)
  const byTitle = positions.reduce<Record<string, OrgPosition[]>>((acc, p) => {
    const key = p.jobTitle || "Sin puesto";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const jobTitles = Object.keys(byTitle).sort();

  // Derivar puesto seleccionado desde assigneeDeptId (guardamos "jobTitle||personId")
  const [selectedTitle, setSelectedTitle] = useState(() => {
    if (!node.data.assigneeDeptId) return "";
    const [title] = node.data.assigneeDeptId.split("||");
    return title;
  });

  const [selectedPerson, setSelectedPerson] = useState(() => {
    if (!node.data.assigneeDeptId) return "";
    const parts = node.data.assigneeDeptId.split("||");
    return parts[1] ?? "";
  });

  const handleTitleChange = (title: string) => {
    setSelectedTitle(title);
    setSelectedPerson("");
    const value = title ? title : undefined;
    onUpdate(node.id, { assigneeDeptId: value });
  };

  const handlePersonChange = (personId: string) => {
    setSelectedPerson(personId);
    const value = selectedTitle
      ? personId
        ? `${selectedTitle}||${personId}`
        : selectedTitle
      : undefined;
    onUpdate(node.id, { assigneeDeptId: value });
  };

  return (
    <div
      className="flex flex-col gap-3"
      style={{
        width: 240,
        background: "var(--c-bg-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
          Propiedades
        </p>
        <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar" className="rounded p-1 hover:bg-[var(--c-border)]" style={{ color: "var(--c-text-muted)" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
          Nombre
        </label>
        <input
          value={node.data.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
        />
      </div>

      {(node.type !== "startEvent" && node.type !== "endEvent") && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
            Descripción
          </label>
          <textarea
            value={node.data.description ?? ""}
            onChange={(e) => onUpdate(node.id, { description: e.target.value })}
            rows={2}
            className="w-full resize-none rounded px-3 py-2 text-sm outline-none"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
          />
        </div>
      )}

      {node.type === "userTask" && (
        <>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
              Puesto responsable
            </label>
            <select
              value={selectedTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              <option value="">— Sin asignar —</option>
              {jobTitles.map((title) => (
                <option key={title} value={title}>
                  {title} ({byTitle[title].length})
                </option>
              ))}
            </select>
            {jobTitles.length === 0 && (
              <p className="mt-1 font-mono text-[9px]" style={{ color: "var(--c-text-placeholder)" }}>
                Sin puestos en el organigrama todavía
              </p>
            )}
          </div>

          {selectedTitle && byTitle[selectedTitle]?.length > 1 && (
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
                Persona específica (opcional)
              </label>
              <select
                value={selectedPerson}
                onChange={(e) => handlePersonChange(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
              >
                <option value="">— Cualquiera del puesto —</option>
                {byTitle[selectedTitle].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {node.type === "userTask" && (
        <>
          <button
            type="button"
            onClick={onOpenLayoutBuilder}
            className="flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px"
            style={{ background: "var(--c-accent-blue)" }}
          >
            <LayoutTemplate className="h-4 w-4" strokeWidth={2} />
            Diseñar ventana del paso
          </button>
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
            {(node.data.layout?.length ?? 0) > 0
              ? `${node.data.layout!.length} elemento(s) en la ventana de este paso.`
              : "Sin diseño todavía. Abrí el diseñador para armar la ventana que verá quien ejecute este paso."}
          </p>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--c-text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={node.data.allowTracking ?? false}
              onChange={(e) => onUpdate(node.id, { allowTracking: e.target.checked })}
            />
            Permitir seguimiento al paso anterior
          </label>
        </>
      )}

      {(node.type === "serviceTask" || node.type === "automatedTask") && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
            Service action
          </label>
          <input
            value={node.data.serviceAction ?? ""}
            onChange={(e) => onUpdate(node.id, { serviceAction: e.target.value || undefined })}
            placeholder="ej: send_welcome_email"
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
          />
        </div>
      )}
    </div>
  );
}
