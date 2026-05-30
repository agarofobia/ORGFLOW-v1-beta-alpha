"use client";

// Editor de la lista de campos del proceso (modelo "tren de carga"). Define los
// FormField compartidos; el diseñador de ventana (StepLayoutBuilder) los coloca por paso.
import { X } from "lucide-react";
import type { FormField, FormFieldType } from "@/lib/process-types";
import { FIELD_TYPES, OPTION_FIELD_TYPES } from "./field-config";

export function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const addField = () => {
    onChange([
      ...fields,
      { id: `field-${Date.now()}`, type: "text", label: "Nuevo campo", required: false },
    ]);
  };

  const updateField = (id: string, patch: Partial<FormField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
          Campos del formulario
        </label>
        <button
          onClick={addField}
          className="rounded px-2 py-0.5 font-mono text-[9px] text-white"
          style={{ background: "var(--c-accent-blue)" }}
        >
          + Campo
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-[10px]" style={{ color: "var(--c-text-placeholder)" }}>
          Sin campos — el responsable solo confirma la tarea.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {fields.map((field, i) => (
          <div key={field.id} className="rounded px-2 py-2"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
            <div className="mb-1.5 flex items-center gap-1">
              <span className="font-mono text-[9px]" style={{ color: "var(--c-text-dim)" }}>{i + 1}</span>
              <input
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
              />
              <button onClick={() => removeField(field.id)} style={{ color: "var(--c-text-muted)" }}>
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={field.type}
                onChange={(e) => updateField(field.id, { type: e.target.value as FormFieldType })}
                className="flex-1 rounded px-1.5 py-1 text-[10px] outline-none"
                style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(field.id, { required: e.target.checked })}
                />
                Req.
              </label>
            </div>
            {OPTION_FIELD_TYPES.includes(field.type) && (
              <div className="mt-1.5 flex flex-col gap-1">
                {/* Toggle: manual vs dynamic */}
                <div className="flex gap-1">
                  {(["manual", "departments", "employees", "divisions"] as const).map((opt) => {
                    const active = opt === "manual" ? !field.source : field.source === opt;
                    const labels: Record<string, string> = { manual: "Manual", departments: "Depts", employees: "Empleados", divisions: "Divisiones" };
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateField(field.id, { source: opt === "manual" ? undefined : opt as "departments" | "employees" | "divisions" })}
                        className="rounded px-1.5 py-0.5 text-[9px] transition-colors"
                        style={{
                          background: active ? "rgb(var(--c-accent-blue-rgb) / 0.13)" : "var(--c-bg-surface)",
                          border: `1px solid ${active ? "var(--c-accent-blue)" : "var(--c-border)"}`,
                          color: active ? "var(--c-accent-blue)" : "var(--c-text-muted)",
                        }}
                      >
                        {labels[opt]}
                      </button>
                    );
                  })}
                </div>
                {/* Manual options input — only when no dynamic source */}
                {!field.source && (
                  <input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) => updateField(field.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="Opción 1, Opción 2…"
                    className="w-full rounded px-2 py-1 text-[10px] outline-none"
                    style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}
                  />
                )}
                {field.source && (
                  <p className="text-[9px]" style={{ color: "var(--c-text-muted)" }}>
                    Opciones cargadas dinámicamente desde {field.source === "departments" ? "departamentos" : field.source === "employees" ? "empleados" : "divisiones"} de la org.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
