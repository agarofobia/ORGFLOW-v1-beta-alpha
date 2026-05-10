"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, Loader2, FileText, AlertCircle } from "lucide-react";
import type { InboxTask } from "@/db/schema";
import type { FormField, FormFieldType } from "@/app/dashboard/processes/[id]/page";

// ─── Field renderer ───────────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base = "w-full rounded px-3 py-2 text-sm outline-none";
  const style = { background: "#141928", border: "1px solid #1E2540", color: "#E2E8F8" };

  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        className={`${base} resize-none`}
        style={style}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        className={base}
        style={{ ...style, color: value ? "#E2E8F8" : "#7A8BAD" }}
      >
        <option value="">— Seleccionar —</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm" style={{ color: "#C4CFEA", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        {field.label}
      </label>
    );
  }
  if (field.type === "file") {
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
      className={base}
      style={style}
    />
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface TaskWithForm extends InboxTask {
  formFields?: FormField[];
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
        // Pre-fill with existing formData if task was already partially filled
        if (data.formData && typeof data.formData === "object") {
          setFormData(data.formData as Record<string, unknown>);
        }
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

  const hasFields = (task?.formFields?.length ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl"
        style={{ background: "#0E1220", border: "1px solid #1E2540", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#1E2540" }}>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: "#3D7EFF" }} />
            <span className="font-semibold text-sm" style={{ color: "#E2E8F8" }}>
              {loading ? "Cargando…" : task?.nodeLabel ?? "Tarea"}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#3D7EFF" }} />
          </div>
        ) : !task ? (
          <div className="py-12 text-center text-sm" style={{ color: "#F43F5E" }}>
            Tarea no encontrada
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Task info */}
              <p className="mb-5 text-xs leading-relaxed" style={{ color: "#7A8BAD" }}>
                {task.processName}
                {task.nodeLabel !== task.processName && <> · {task.nodeLabel}</>}
              </p>

              {!hasFields ? (
                <div
                  className="rounded-lg p-5 text-center"
                  style={{ background: "#141928", border: "1px dashed #1E2540" }}
                >
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8" style={{ color: "#10D9A0" }} />
                  <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>
                    Sin formulario requerido
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>
                    Esta etapa solo requiere confirmación. Hacé click en "Completar" para avanzar.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {task.formFields!.map((field) => (
                    <div key={field.id}>
                      {field.type !== "checkbox" && (
                        <label className="mb-1.5 block text-sm font-medium" style={{ color: "#C4CFEA" }}>
                          {field.label}
                          {field.required && <span className="ml-1" style={{ color: "#F43F5E" }}>*</span>}
                        </label>
                      )}
                      <FieldInput
                        field={field}
                        value={formData[field.id]}
                        onChange={(v) => setFormData((prev) => ({ ...prev, [field.id]: v }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded px-3 py-2" style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#F43F5E" }} />
                  <p className="text-xs" style={{ color: "#F43F5E" }}>{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "#1E2540" }}>
              <button
                type="button"
                onClick={onClose}
                className="rounded px-4 py-2 text-sm"
                style={{ color: "#7A8BAD", background: "#141928", border: "1px solid #1E2540" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#10D9A0" }}
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
