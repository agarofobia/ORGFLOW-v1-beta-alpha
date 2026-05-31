"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, Loader2, FileText, AlertCircle } from "lucide-react";
import type { InboxTask } from "@/db/schema";
import type { FormField, FormFieldType, LayoutElement, StepAction } from "@/lib/process-types";
import { evalShowWhen, interpolate } from "@/lib/form-conditions";
import { resolveColor } from "@/components/dashboard/processes/layout-style";

const CANVAS_W = 680; // mismo ancho que el lienzo del builder (WYSIWYG)

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
  if (field.type === "currency") {
    if (readOnly) {
      const n = Number(value);
      return <div className={base} style={style}>{value != null && value !== "" ? `$ ${isNaN(n) ? value : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</div>;
    }
    return (
      <div className="flex items-center rounded" style={{ ...style, padding: 0 }}>
        <span className="px-2 text-sm" style={{ color: "var(--c-text-muted)" }}>$</span>
        <input
          type="number" step="0.01" inputMode="decimal"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "0,00"}
          required={field.required}
          className="w-full bg-transparent py-2 pr-3 text-sm outline-none"
          style={{ color: "var(--c-text-primary)" }}
        />
      </div>
    );
  }
  if (field.type === "radio") {
    const opts = field.source ? dynamicOptions : (field.options ?? []).map((o) => ({ value: o, label: o }));
    return (
      <div className="flex flex-col gap-1.5">
        {opts.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-secondary)", cursor: readOnly ? "default" : "pointer" }}>
            <input type="radio" name={field.id} value={opt.value} checked={value === opt.value} disabled={readOnly}
              onChange={(e) => onChange(e.target.value)} className="h-4 w-4" />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "multiselect") {
    const opts = field.source ? dynamicOptions : (field.options ?? []).map((o) => ({ value: o, label: o }));
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (v: string) => {
      if (readOnly) return;
      onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    };
    return (
      <div className="flex flex-col gap-1.5">
        {opts.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-secondary)", cursor: readOnly ? "default" : "pointer" }}>
            <input type="checkbox" checked={arr.includes(opt.value)} disabled={readOnly}
              onChange={() => toggle(opt.value)} className="h-4 w-4" />
            {opt.label}
          </label>
        ))}
      </div>
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
  layout?: LayoutElement[];              // diseño visual de la ventana de este paso
  actions?: StepAction[];                // acciones/decisiones del paso (botones que ramifican)
  systemVars?: Record<string, string>;  // variables de sistema resueltas ({@usuario}, {@hoy}…)
}

// Tipos cuyo valor por defecto (con tokens) tiene sentido pre-llenar.
const DEFAULTABLE_TYPES = new Set<FormFieldType>(["text", "textarea"]);

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
        const merged = { ...accumulated, ...own } as Record<string, unknown>;
        // Valor por defecto con tokens: si el campo está vacío y tiene defaultValue,
        // lo interpolamos (campos del proceso + variables de sistema) como inicial.
        const fields = (data.formFields ?? []) as FormField[];
        const interp = fields.map((f) => ({ id: f.id, label: f.label }));
        const sysVars = (data.systemVars ?? {}) as Record<string, string>;
        for (const f of fields) {
          const cur = merged[f.id];
          const empty = cur == null || cur === "";
          if (empty && f.defaultValue && DEFAULTABLE_TYPES.has(f.type)) {
            merged[f.id] = interpolate(f.defaultValue, interp, merged, sysVars);
          }
        }
        setFormData(merged);
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  // Valida los campos OBLIGATORIOS visibles (ignora los ocultos por condición y los
  // de solo lectura). Cubre todos los tipos, incluidos radio/multiselección/checkbox/file
  // que la validación nativa del navegador no enforza bien. Devuelve null si está OK.
  const validateRequired = (): string | null => {
    const lay = task?.layout ?? [];
    const byId = new Map((task?.formFields ?? []).map((f) => [f.id, f]));
    for (const el of lay) {
      if (el.kind !== "field" || !el.fieldId || el.readOnly) continue;
      if (!evalShowWhen(el.showWhen, formData)) continue; // oculto por condición → no exige
      const f = byId.get(el.fieldId);
      if (!f || !f.required) continue;
      const v = formData[f.id];
      const empty =
        v == null || v === "" ||
        (Array.isArray(v) && v.length === 0) ||
        (f.type === "checkbox" && v !== true) ||
        (f.type === "file" && !(v as { data?: string } | undefined)?.data);
      if (empty) return `Falta completar "${f.label}".`;
    }
    return null;
  };

  // Completa el paso. `actionId` = decisión elegida (si el paso define acciones).
  const submit = async (actionId?: string) => {
    const invalid = validateRequired();
    if (invalid) { setError(invalid); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", formData, actionId }),
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(undefined);
  };

  const actions = task?.actions ?? [];

  // El paso define su ventana con un layout visual (builder estilo Canva).
  const layout = task?.layout ?? [];
  const fieldById = new Map((task?.formFields ?? []).map((f) => [f.id, f]));
  // Para texto dinámico {label}: lista id+label de los campos del proceso.
  const interpFields = (task?.formFields ?? []).map((f) => ({ id: f.id, label: f.label }));
  // Alto del lienzo = el necesario para contener todos los elementos.
  const canvasHeight = layout.reduce((max, el) => Math.max(max, el.y + el.h), 0) + 24;
  const hasLayout = layout.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgb(0 0 0 / 0.6)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full overflow-hidden rounded-2xl"
        style={{ maxWidth: CANVAS_W + 96, background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.25)", boxShadow: "0 24px 80px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(var(--c-accent-blue-rgb) / 0.05)", maxHeight: "94vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--c-border)", background: "linear-gradient(180deg, rgb(var(--c-accent-blue-rgb) / 0.06), transparent)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.15)" }}>
              <FileText className="h-4 w-4" style={{ color: "var(--c-accent-blue)" }} />
            </div>
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

              {!hasLayout ? (
                <div
                  className="rounded-lg p-5 text-center"
                  style={{ background: "var(--c-bg-elevated)", border: "1px dashed var(--c-border)" }}
                >
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--c-accent-emerald)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                    Sin formulario requerido
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--c-text-muted)" }}>
                    Esta etapa solo requiere confirmación. Hacé click en &quot;Completar&quot; para avanzar.
                  </p>
                </div>
              ) : (
                // Render WYSIWYG: cada elemento en su posición del lienzo del paso.
                <div className="relative mx-auto" style={{ width: CANVAS_W, height: canvasHeight }}>
                  {layout.map((el) => {
                    // Lógica condicional: si tiene showWhen y no se cumple → no se muestra.
                    // Se re-evalúa en vivo porque formData está en estado.
                    if (!evalShowWhen(el.showWhen, formData)) return null;
                    // Secciones detrás (z-index bajo); el resto encima.
                    const common = { position: "absolute" as const, left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.kind === "section" ? 1 : 2 };
                    if (el.kind === "divider") {
                      return <div key={el.id} style={{ ...common, display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: Math.max(1, el.thickness ?? 2), background: resolveColor(el.color, "var(--c-border)") }} /></div>;
                    }
                    if (el.kind === "section") {
                      return (
                        <div key={el.id} style={{ ...common, borderRadius: 12, border: "1px solid var(--c-border)", background: `rgb(var(--c-border-rgb) / ${el.fill ?? 0.4})` }}>
                          {el.text && <span className="flo-label absolute left-3.5 top-2.5">{el.text}</span>}
                        </div>
                      );
                    }
                    if (el.kind === "image") {
                      return el.src
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img key={el.id} src={el.src} alt="" style={{ ...common, objectFit: el.imageFit ?? "contain", borderRadius: 8 }} />
                        : null;
                    }
                    if (el.kind === "title" || el.kind === "text") {
                      const vItems = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
                      return (
                        <div key={el.id} style={{ ...common, display: "flex", flexDirection: "column", justifyContent: vItems, fontSize: el.fontSize ?? (el.kind === "title" ? 22 : 13), fontWeight: el.fontWeight ?? (el.kind === "title" ? 700 : 400), fontFamily: el.fontFamily ?? "inherit", color: resolveColor(el.color, el.kind === "title" ? "var(--c-text-primary)" : "var(--c-text-muted)"), textAlign: el.align ?? "left" }}>
                          {interpolate(el.text ?? "", interpFields, formData, task?.systemVars ?? {})}
                        </div>
                      );
                    }
                    // field
                    const field = el.fieldId ? fieldById.get(el.fieldId) : undefined;
                    if (!field) return null;
                    const readOnly = el.readOnly === true;
                    return (
                      <div key={el.id} style={{ ...common, display: "flex", flexDirection: "column", gap: 4 }}>
                        {field.type !== "checkbox" && (
                          <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
                            {field.label}
                            {field.required && !readOnly && <span style={{ color: "var(--c-accent-red)" }}>*</span>}
                            {readOnly && (
                              <span className="rounded px-1 py-0.5 font-mono text-[8px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)", color: "var(--c-accent-amber)" }}>
                                solo lectura
                              </span>
                            )}
                          </label>
                        )}
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <FieldInput
                            field={field}
                            value={formData[field.id]}
                            onChange={(v) => setFormData((prev) => ({ ...prev, [field.id]: v }))}
                            readOnly={readOnly}
                          />
                        </div>
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

            {/* Footer — acciones del paso (decisión) o Completar por defecto */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--c-border)" }}>
              <button
                type="button"
                onClick={onClose}
                className="mr-auto rounded px-4 py-2 text-sm"
                style={{ color: "var(--c-text-muted)", background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}
              >
                Cancelar
              </button>
              {actions.length > 0 ? (
                actions.map((a) => {
                  const styleByIntent =
                    a.intent === "danger"
                      ? { background: "var(--c-accent-red)", color: "#fff", border: "none" }
                      : a.intent === "neutral"
                      ? { background: "var(--c-bg-elevated)", color: "var(--c-text-primary)", border: "1px solid var(--c-border-strong)" }
                      : { background: "var(--c-accent-emerald)", color: "#fff", border: "none" };
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => submit(a.id)}
                      className="flex items-center gap-2 rounded px-5 py-2 text-sm font-medium disabled:opacity-50"
                      style={styleByIntent}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {a.label}
                    </button>
                  );
                })
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--c-accent-emerald)" }}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Completar
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
