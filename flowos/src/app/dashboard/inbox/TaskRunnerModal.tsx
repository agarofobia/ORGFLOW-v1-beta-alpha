"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, Loader2, FileText, AlertCircle } from "lucide-react";
import type { InboxTask } from "@/db/schema";
import type { FormField, FormFieldType } from "@/app/dashboard/processes/[id]/page";

// ─── Dynamic options hook ─────────────────────────────────────────────────────

function useDynamicOptions(source: "departments" | "employees" | "divisions" | undefined) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!source) return;
    const endpoint = source === "departments"
      ? "/api/departments"
      : source === "employees"
      ? "/api/employees"
      : "/api/divisions";
    fetch(endpoint)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        setOptions(
          (data as Record<string, unknown>[]).map((item) => ({
            value: String(item.id ?? ""),
            label: String(item.name ?? item.fullName ?? item.id ?? ""),
          }))
        );
      })
      .catch(() => {});
  }, [source]);
  return options;
}

// ─── Field renderer ───────────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
  readOnly = false,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  const base = "w-full rounded px-3 py-2 text-sm outline-none";
  const style = {
    background: readOnly ? "var(--c-bg-base)" : "var(--c-bg-elevated)",
    border: "1px solid var(--c-border)",
    color: readOnly ? "var(--c-text-secondary)" : "var(--c-text-primary)",
    cursor: readOnly ? "default" : undefined,
  };
  const dynamicOptions = useDynamicOptions(field.source);

  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        disabled={readOnly}
        className={`${base} resize-none`}
        style={style}
      />
    );
  }
  if (field.type === "select") {
    const opts = field.source
      ? dynamicOptions
      : (field.options ?? []).map((o) => ({ value: o, label: o }));
    // En read-only mostramos la etiqueta resuelta (no el <select>), para que un
    // valor dinámico se vea con su label legible y no el id crudo.
    if (readOnly) {
      const current = opts.find((o) => o.value === value);
      return (
        <div className={base} style={style}>
          {current?.label ?? (value as string) ?? "—"}
        </div>
      );
    }
    return (
      <select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        className={base}
        style={{ ...style, color: value ? "var(--c-text-primary)" : "var(--c-text-muted)" }}
      >
        <option value="">— Seleccionar —</option>
        {opts.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-secondary)", cursor: readOnly ? "default" : "pointer" }}>
        <input
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
          className="h-4 w-4"
        />
        {field.label}
      </label>
    );
  }
  if (field.type === "file") {
    // En read-only mostramos el nombre del archivo cargado, sin permitir reemplazo.
    if (readOnly) {
      const fileVal = value as { name?: string } | undefined;
      return (
        <div className={base} style={style}>
          {fileVal?.name ?? "— Sin archivo —"}
        </div>
      );
    }
    return (
      <input
        type="file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => onChange({ name: f.name, size: f.size, data: reader.result });
          reader.readAsDataURL(f);
        }}
        required={field.required}
        className={base}
        style={style}
      />
    );
  }
  // text | number | date
  return (
    <input
      type={field.type as string}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      required={field.required}
      disabled={readOnly}
      className={base}
      style={style}
    />
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface TaskWithForm extends InboxTask {
  formFields?: FormField[];
  fieldValues?: Record<string, unknown>; // valores acumulados de pasos anteriores (tren de carga)
  fieldVisibility?: Record<string, "hidden" | "view" | "edit">; // visibilidad por paso (Fase 2)
}

export default function TaskRunnerModal({
  taskId,
  onClose,
  onCompleted,
}: {
  taskId: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [task, setTask] = useState<TaskWithForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/inbox/${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        setTask(data);
        // Pre-llenar con los valores acumulados del proceso (tren de carga) —
        // así este paso ve lo que cargaron los anteriores — y encima el formData
        // propio de la tarea si ya estaba parcialmente completada.
        const accumulated = (data.fieldValues && typeof data.fieldValues === "object") ? data.fieldValues : {};
        const own = (data.formData && typeof data.formData === "object") ? data.formData : {};
        setFormData({ ...accumulated, ...own } as Record<string, unknown>);
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", formData }),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        onCompleted();
      } else {
        setError(data.error ?? "Error al completar la tarea");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Visibilidad por paso (Fase 2): un campo sin config explícita → "edit" (default).
  const visOf = (fieldId: string): "hidden" | "view" | "edit" =>
    task?.fieldVisibility?.[fieldId] ?? "edit";
  const visibleFields = (task?.formFields ?? []).filter((f) => visOf(f.id) !== "hidden");
  const hasFields = visibleFields.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--c-shadow-strong)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl"
        style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--c-border)" }}>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: "var(--c-accent-blue)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--c-text-primary)" }}>
              {loading ? "Cargando…" : task?.nodeLabel ?? "Tarea"}
            </span>
          </div>
          <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar" className="rounded p-1 hover:bg-[var(--c-border)]" style={{ color: "var(--c-text-muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
          </div>
        ) : !task ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--c-accent-red)" }}>
            Tarea no encontrada
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Task info */}
              <p className="mb-5 text-xs leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
                {task.processName}
                {task.nodeLabel !== task.processName && <> · {task.nodeLabel}</>}
              </p>

              {!hasFields ? (
                <div
                  className="rounded-lg p-5 text-center"
                  style={{ background: "var(--c-bg-elevated)", border: "1px dashed var(--c-border)" }}
                >
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--c-accent-emerald)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                    Sin formulario requerido
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--c-text-muted)" }}>
                    Esta etapa solo requiere confirmación. Hacé click en "Completar" para avanzar.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {visibleFields.map((field) => {
                    const readOnly = visOf(field.id) === "view";
                    return (
                      <div key={field.id}>
                        {field.type !== "checkbox" && (
                          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--c-text-secondary)" }}>
                            {field.label}
                            {field.required && !readOnly && <span style={{ color: "var(--c-accent-red)" }}>*</span>}
                            {readOnly && (
                              <span className="rounded px-1 py-0.5 font-mono text-[8px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)", color: "var(--c-accent-amber)" }}>
                                solo lectura
                              </span>
                            )}
                          </label>
                        )}
                        <FieldInput
                          field={field}
                          value={formData[field.id]}
                          onChange={(v) => setFormData((prev) => ({ ...prev, [field.id]: v }))}
                          readOnly={readOnly}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded px-3 py-2" style={{ background: "rgb(var(--c-accent-red-rgb) / 0.1)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.2)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-red)" }} />
                  <p className="text-xs" style={{ color: "var(--c-accent-red)" }}>{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--c-border)" }}>
              <button
                type="button"
                onClick={onClose}
                className="rounded px-4 py-2 text-sm"
                style={{ color: "var(--c-text-muted)", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--c-accent-emerald)" }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Completar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
