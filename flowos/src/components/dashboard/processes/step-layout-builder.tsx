"use client";

// Diseñador visual de la ventana de un paso (lienzo estilo Canva): paleta con
// drag-spawn, mover/redimensionar con guías (react-moveable), zoom, undo/redo,
// toolbar flotante, panel de capas, lógica condicional, texto dinámico, upload de
// imágenes y vista previa runtime. Exporta StepLayoutBuilder; el resto es interno.
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Heading,
  Minus,
  SquareDashed,
  Type as TextIcon,
  Image as ImageIcon,
  Copy,
  Filter,
  Eye,
  Undo2,
  Redo2,
  Layers,
  Upload,
  GripVertical,
  Move as MoveIcon,
  Ruler,
  LayoutTemplate,
  X,
  Loader2,
  ListChecks,
  Circle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Asterisk,
  Lock,
  MousePointer2,
  Braces,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Moveable from "react-moveable";
import { evalShowWhen, interpolate } from "@/lib/form-conditions";
import type {
  FormField, FormFieldType, LayoutElement, ShowWhen, ConditionOperator, ColorToken,
} from "@/lib/process-types";
import { FIELD_TYPES, OPTION_FIELD_TYPES } from "./field-config";
import { resolveColor, COLOR_VAR, TEXT_COLOR_SWATCHES, DIVIDER_COLOR_SWATCHES } from "./layout-style";

// ─── Step Layout Builder (lienzo visual estilo Canva, por paso) ───────────────
// Diseñador WYSIWYG de la ventana de un paso. Arrastrás campos/títulos/textos al
// lienzo, los posicionás y redimensionás con guías de alineación (react-moveable).
// El ancho del lienzo = ancho de la ventana del runtime (WYSIWYG).

const CANVAS_W = 680;
const CANVAS_H = 900;

// Elementos visuales de la paleta — con ícono y descripción de qué hace cada uno.
const PALETTE_ELEMENTS: { kind: "title" | "text" | "divider" | "section" | "image"; label: string; desc: string; Icon: typeof Heading }[] = [
  { kind: "title", label: "Título", desc: "Encabezado grande de la ventana.", Icon: Heading },
  { kind: "text", label: "Texto", desc: "Subtítulo o instrucción de ayuda.", Icon: TextIcon },
  { kind: "divider", label: "Divisor", desc: "Línea para separar secciones.", Icon: Minus },
  { kind: "section", label: "Sección", desc: "Caja de fondo para agrupar campos visualmente.", Icon: SquareDashed },
  { kind: "image", label: "Imagen", desc: "Logo, diagrama o instrucción visual (URL o subida).", Icon: ImageIcon },
];

// Tipografías disponibles para título/texto.
const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Por defecto", value: "" },
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Sans-serif", value: "system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Monoespaciada", value: "monospace" },
];

function nid() {
  return `el-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

// Tipo de presentación (no-campo) de la paleta.
type PresentKind = "title" | "text" | "divider" | "section" | "image";

// Construye un elemento de presentación con sus defaults, en (x, y).
function makePresentEl(kind: PresentKind, x: number, y: number): LayoutElement {
  const base: LayoutElement = { id: nid(), kind, x, y, w: 0, h: 0 };
  if (kind === "title") Object.assign(base, { text: "Título", w: 360, h: 44, fontSize: 22, align: "left" });
  if (kind === "text") Object.assign(base, { text: "Texto de ayuda", w: 360, h: 30, fontSize: 13, align: "left" });
  if (kind === "divider") Object.assign(base, { w: 460, h: 2 });
  if (kind === "section") Object.assign(base, { text: "Sección", w: 480, h: 160 });
  if (kind === "image") Object.assign(base, { src: "", w: 200, h: 120 });
  return base;
}

// Construye un FormField nuevo con defaults sensatos por tipo (para crear campos
// directo desde la paleta del diseñador, sin ir al panel de campos del proceso).
function makeNewField(type: FormFieldType): FormField {
  const label = FIELD_TYPES.find((t) => t.value === type)?.label ?? "Campo";
  const f: FormField = {
    id: `field-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
    type,
    label: `Nuevo ${label.toLowerCase()}`,
    required: false,
  };
  if (OPTION_FIELD_TYPES.includes(type)) f.options = ["Opción A", "Opción B", "Opción C"];
  return f;
}

// Mapas de presentación (ícono / label / tamaño) para paleta, ghost y capas.
const PRESENT_ICON: Record<PresentKind, typeof Heading> = {
  title: Heading, text: TextIcon, divider: Minus, section: SquareDashed, image: ImageIcon,
};
const PRESENT_LABEL: Record<PresentKind, string> = {
  title: "Título", text: "Texto", divider: "Divisor", section: "Sección", image: "Imagen",
};
const PRESENT_SIZE: Record<PresentKind, { w: number; h: number }> = {
  title: { w: 360, h: 44 }, text: { w: 360, h: 30 }, divider: { w: 460, h: 2 }, section: { w: 480, h: 160 }, image: { w: 200, h: 120 },
};
// Ícono por tipo de campo (para ghost de arrastre y panel de capas).
const FIELD_TYPE_ICON: Record<FormFieldType, typeof Heading> = {
  text: TextIcon, textarea: TextIcon, number: Heading, date: Heading, select: ListChecks,
  checkbox: Check, file: ImageIcon, currency: Heading, radio: Circle, multiselect: ListChecks,
};

// Payload del arrastre desde la paleta.
type SpawnPayload =
  | { source: "field"; field: FormField }
  | { source: "present"; kind: PresentKind };
type SpawnState =
  | { payload: SpawnPayload; x: number; y: number; moved: boolean; icon: typeof Heading; label: string; accent: string }
  | null;

// ─── Componentes UI del inspector (sistema de diseño del prototipo) ───────────

function PRow({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      {label && <div className="flo-label mb-1.5">{label}</div>}
      {children}
      {hint && <div className="mt-1 text-[11px] leading-snug" style={{ color: "var(--c-text-dim)" }}>{hint}</div>}
    </div>
  );
}

function FloInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      className="flo-input w-full"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ height: 34, padding: "0 10px", fontSize: 13, fontFamily: mono ? "var(--font-dm-mono)" : "inherit" }}
    />
  );
}

function ToggleRow({ label, value, onChange, Icon, amber }: { label: string; value: boolean; onChange: (v: boolean) => void; Icon?: typeof Heading; amber?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: "var(--c-text-muted)" }} />}
        <span className="text-[12.5px]" style={{ color: "var(--c-text-secondary)" }}>{label}</span>
      </div>
      <div className={`flo-switch${value ? " on" : ""}${amber ? " amber" : ""}`} onClick={() => onChange(!value)}><span className="knob" /></div>
    </div>
  );
}

type SegOpt<T> = { value: T; label?: string; Icon?: typeof Heading; title?: string };
function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: SegOpt<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="flo-seg">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)} title={o.title || o.label}>
          {o.Icon && <o.Icon className="h-3.5 w-3.5" />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 7, padding: "0 9px", height: 32 }}>
      <span className="font-mono text-[10px]" style={{ color: "var(--c-text-muted)", width: 11 }}>{label}</span>
      <input
        value={Math.round(value)}
        onChange={(e) => { const v = parseInt(e.target.value, 10); onChange(isNaN(v) ? 0 : v); }}
        className="font-mono"
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--c-text-primary)", fontSize: 12.5, width: "100%" }}
      />
    </div>
  );
}

function ColorSwatches({ value, onChange, swatches }: { value: ColorToken | undefined; onChange: (v: ColorToken) => void; swatches: ColorToken[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {swatches.map((tok) => (
        <button key={tok} type="button" onClick={() => onChange(tok)} title={tok}
          style={{
            width: 26, height: 26, borderRadius: 7, background: COLOR_VAR[tok],
            border: value === tok ? "2px solid #fff" : "1px solid var(--c-border-strong)",
            boxShadow: value === tok ? "0 0 0 2px rgb(var(--c-accent-blue-rgb) / 0.5)" : "none", cursor: "pointer",
          }} />
      ))}
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: string[] | undefined; onChange: (v: string[]) => void }) {
  const opts = options ?? [];
  const set = (i: number, v: string) => { const n = opts.slice(); n[i] = v; onChange(n); };
  const add = () => onChange([...opts, `Opción ${opts.length + 1}`]);
  const del = (i: number) => onChange(opts.filter((_, j) => j !== i));
  return (
    <div className="flex flex-col gap-1.5">
      {opts.map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <GripVertical className="h-3 w-3 shrink-0" style={{ color: "var(--c-text-dim)" }} />
          <input className="flo-input" value={o} onChange={(e) => set(i, e.target.value)} style={{ flex: 1, height: 32, padding: "0 9px", fontSize: 12.5 }} />
          <button type="button" onClick={() => del(i)} className="shrink-0 p-0.5" style={{ color: "var(--c-text-dim)" }}><X className="h-3 w-3" /></button>
        </div>
      ))}
      <button type="button" onClick={add} className="flo-ghost flex items-center justify-center gap-1.5" style={{ height: 30, fontSize: 12 }}>
        <Plus className="h-3 w-3" /> Agregar opción
      </button>
    </div>
  );
}

// Insertar token de texto dinámico {Campo} en título/texto.
function DynInsert({ fields, onInsert }: { fields: FormField[]; onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (fields.length === 0) return null;
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flo-ghost flex items-center gap-1.5" style={{ height: 28, padding: "0 9px", fontSize: 11.5 }}>
        <Braces className="h-3 w-3" style={{ color: "var(--c-accent-blue)" }} /> Insertar campo
      </button>
      {open && (
        <div className="flo-popin absolute left-0 z-40 overflow-auto" style={{ top: 32, background: "var(--c-bg-overlay)", border: "1px solid var(--c-border-strong)", borderRadius: 9, padding: 5, boxShadow: "0 16px 40px rgb(0 0 0 / 0.55)", minWidth: 180, maxHeight: 220 }}>
          {fields.map((f) => (
            <div key={f.id} onClick={() => { onInsert(`{${f.label}}`); setOpen(false); }}
              className="cursor-pointer rounded px-2 py-1.5 text-[12.5px] hover:bg-[var(--c-bg-elevated)]" style={{ color: "var(--c-text-secondary)" }}>
              <span style={{ color: "var(--c-accent-blue)", background: "rgb(var(--c-accent-blue-rgb) / 0.12)", borderRadius: 4, padding: "0 3px" }}>{`{${f.label}}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StepLayoutBuilder({
  nodeLabel,
  processFields,
  layout,
  onChange,
  onCreateField,
  onClose,
}: {
  nodeLabel: string;
  processFields: FormField[];
  layout: LayoutElement[];
  onChange: (layout: LayoutElement[]) => void;
  onCreateField: (fields: FormField[]) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [newFieldMenu, setNewFieldMenu] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [spawn, setSpawn] = useState<SpawnState>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cascadeRef = useRef(0);
  const zoomBy = (d: number) => setZoom((z) => Math.min(2, Math.max(0.4, Math.round((z + d) * 100) / 100)));

  // ─── Historial undo/redo ────────────────────────────────────────────────────
  // `layout` es controlado por el padre; guardamos snapshots del array antes de
  // cada mutación. Coalescemos ráfagas (drag con flechas, tipeo en props).
  const past = useRef<LayoutElement[][]>([]);
  const future = useRef<LayoutElement[][]>([]);
  const lastSnap = useRef(0);
  const [, setTick] = useState(0);
  const forceTick = () => setTick((t) => t + 1);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const commit = (next: LayoutElement[], coalesceMs?: number) => {
    const now = Date.now();
    if (!coalesceMs || now - lastSnap.current >= coalesceMs) {
      lastSnap.current = now;
      past.current.push(layoutRef.current);
      if (past.current.length > 80) past.current.shift();
      future.current = [];
    }
    onChange(next);
    forceTick();
  };
  const undo = () => {
    if (!past.current.length) return;
    future.current.push(layoutRef.current);
    onChange(past.current.pop()!);
    forceTick();
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current.push(layoutRef.current);
    onChange(future.current.pop()!);
    forceTick();
  };

  const usedFieldIds = new Set(layout.filter((e) => e.kind === "field").map((e) => e.fieldId));
  // Nuevo elemento debajo del más bajo existente (sin superposición).
  const bottomMost = layout.reduce((m, e) => Math.max(m, e.y + e.h), 0);
  const nextY = Math.min(CANVAS_H - 90, bottomMost > 0 ? bottomMost + 16 : 24);

  const patchEl = (id: string, patch: Partial<LayoutElement>, coalesceMs?: number) =>
    commit(layout.map((e) => (e.id === id ? { ...e, ...patch } : e)), coalesceMs);
  // Edita un FormField del proceso (label, required, opciones…) desde el diseñador.
  const patchField = (fieldId: string | undefined, patch: Partial<FormField>) => {
    if (!fieldId) return;
    onCreateField(processFields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
  };
  const removeEl = (id: string) => {
    commit(layout.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateEl = (id?: string) => {
    const src = layout.find((e) => e.id === (id ?? selectedId));
    if (!src) return;
    const copy: LayoutElement = {
      ...src,
      id: nid(),
      x: Math.min(src.x + 18, CANVAS_W - src.w),
      y: Math.min(src.y + 18, CANVAS_H - src.h),
      // El duplicado de un campo deja de apuntar al field original (evita "ya usado").
      fieldId: undefined,
    };
    commit([...layout, copy]);
    setSelectedId(copy.id);
  };
  const toggleCondition = (id?: string) => {
    const el = layout.find((e) => e.id === (id ?? selectedId));
    if (!el) return;
    if (el.showWhen) {
      patchEl(el.id, { showWhen: undefined });
    } else {
      const first = layout.find((e) => e.kind === "field" && e.id !== el.id && e.fieldId);
      patchEl(el.id, { showWhen: { fieldId: first?.fieldId ?? "", operator: "equals", value: "" } });
    }
  };

  const selected = layout.find((e) => e.id === selectedId) ?? null;
  const fieldOf = (fid?: string) => processFields.find((f) => f.id === fid);

  // Subir imagen directa a Supabase storage (bucket org-files) → setea src.
  const uploadImage = async (id: string, file: File) => {
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "org-files");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      const { url } = await res.json();
      patchEl(id, { src: url });
    } catch {
      // Silencioso: si falla, el usuario puede pegar una URL manualmente.
    } finally {
      setUploadingImg(false);
    }
  };

  // Crea un campo nuevo en el proceso y lo coloca en el lienzo de este paso.
  const createField = (type: FormFieldType) => {
    const f = makeNewField(type);
    onCreateField([...processFields, f]);
    const c = cascadeRef.current; cascadeRef.current = (c + 1) % 6;
    const el: LayoutElement = { id: nid(), kind: "field", fieldId: f.id, x: 24 + c * 16, y: nextY, w: 280, h: 66 };
    commit([...layout, el]);
    setSelectedId(el.id);
    setNewFieldMenu(false);
  };

  // ─── Spawn (arrastrar desde la paleta hacia el lienzo) ──────────────────────
  function placeFromPayload(payload: SpawnPayload, sx: number, sy: number) {
    let el: LayoutElement;
    if (payload.source === "field") {
      if (usedFieldIds.has(payload.field.id)) return;
      el = { id: nid(), kind: "field", fieldId: payload.field.id, x: 0, y: 0, w: 280, h: 66 };
    } else {
      el = makePresentEl(payload.kind, 0, 0);
    }
    el.x = Math.round(Math.min(Math.max(sx, 0), CANVAS_W - el.w));
    el.y = Math.round(Math.min(Math.max(sy, 0), CANVAS_H - el.h));
    commit([...layout, el]);
    setSelectedId(el.id);
  }
  function onSpawnStart(payload: SpawnPayload, e: React.MouseEvent) {
    if (payload.source === "field" && usedFieldIds.has(payload.field.id)) return;
    e.preventDefault();
    const meta =
      payload.source === "field"
        ? { icon: FIELD_TYPE_ICON[payload.field.type] ?? TextIcon, label: payload.field.label, accent: "var(--c-accent-blue)" }
        : { icon: PRESENT_ICON[payload.kind], label: PRESENT_LABEL[payload.kind], accent: "var(--c-accent-violet)" };
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    setSpawn({ payload, x: e.clientX, y: e.clientY, moved: false, ...meta });
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - start.x) > 4 || Math.abs(ev.clientY - start.y) > 4) moved = true;
      setSpawn((s) => (s ? { ...s, x: ev.clientX, y: ev.clientY, moved } : s));
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const r = sheetRef.current?.getBoundingClientRect();
      if (r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        const sz = payload.source === "field" ? { w: 280, h: 66 } : PRESENT_SIZE[payload.kind];
        placeFromPayload(payload, (ev.clientX - r.left) / zoom - sz.w / 2, (ev.clientY - r.top) / zoom - sz.h / 2);
      } else {
        // Soltado fuera del lienzo (o click sin arrastrar) → cascada arriba a la izq.
        const c = cascadeRef.current; cascadeRef.current = (c + 1) % 6;
        placeFromPayload(payload, 24 + c * 16, nextY);
      }
      setSpawn(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ─── Teclado (scope: builder abierto) ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const editing = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "Escape") {
        if (preview) { e.stopPropagation(); setPreview(false); }
        else if (selectedId) { e.stopPropagation(); setSelectedId(null); }
        return;
      }
      if (editing || preview) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (mod && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateEl(); return; }
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEl(selectedId); return; }
      const step = e.shiftKey ? 10 : 1;
      let d: { x?: number; y?: number } | null = null;
      if (e.key === "ArrowLeft") d = { x: -step };
      else if (e.key === "ArrowRight") d = { x: step };
      else if (e.key === "ArrowUp") d = { y: -step };
      else if (e.key === "ArrowDown") d = { y: step };
      if (d) {
        e.preventDefault();
        const cur = layoutRef.current.find((el) => el.id === selectedId);
        if (!cur) return;
        const nx = Math.min(Math.max(cur.x + (d.x ?? 0), 0), CANVAS_W - cur.w);
        const ny = Math.min(Math.max(cur.y + (d.y ?? 0), 0), CANVAS_H - cur.h);
        patchEl(selectedId, { x: nx, y: ny }, 600);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, preview, layout]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--c-bg-base)" }}>
      {/* Header — barra superior estilo módulo */}
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--c-border)", background: "linear-gradient(180deg, rgb(var(--c-accent-blue-rgb) / 0.07), var(--c-bg-surface))" }}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} title="Volver" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--c-bg-elevated)]" style={{ border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.15)", boxShadow: "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.2)" }}>
            <LayoutTemplate className="h-5 w-5" style={{ color: "var(--c-accent-blue)" }} />
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Diseñador de ventana · {nodeLabel}</p>
            <p className="text-base font-semibold" style={{ color: "var(--c-text-primary)" }}>Diseñar ventana del paso</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setPreview(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors hover:bg-[var(--c-bg-elevated)]" style={{ border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
            <Eye className="h-4 w-4" /> Vista previa
          </button>
          <button onClick={onClose} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px" style={{ background: "var(--c-accent-blue)", boxShadow: "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.35)" }}>
            <Check className="h-4 w-4" /> Listo
          </button>
        </div>
      </div>

      {/* Sub-toolbar — undo/redo + contador + chips de ayuda */}
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--c-border)", background: "var(--c-bg-base)" }}>
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={!past.current.length} title="Deshacer (Ctrl+Z)" aria-label="Deshacer"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-bg-elevated)] disabled:opacity-40"
            style={{ border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={redo} disabled={!future.current.length} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-bg-elevated)] disabled:opacity-40"
            style={{ border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px" style={{ background: "var(--c-border)" }} />
          <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--c-text-muted)" }}>
            {layout.length} elementos · {usedFieldIds.size} campos
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded px-2 py-1 font-mono text-[9px] uppercase tracking-wider sm:flex" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.1)", color: "var(--c-accent-blue)" }}>
            <Ruler className="h-3 w-3" /> WYSIWYG · {CANVAS_W}px
          </span>
          <span className="hidden items-center gap-1.5 rounded px-2 py-1 font-mono text-[9px] uppercase tracking-wider md:flex" style={{ background: "var(--c-bg-elevated)", color: "var(--c-text-muted)" }}>
            <MoveIcon className="h-3 w-3" /> ↑↓←→ mueve · ⌘D duplica · Supr borra
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Paleta — una sola barra: campos del proceso, elementos visuales y capas */}
        <div className="flo-scroll w-[252px] shrink-0 overflow-y-auto border-r" style={{ borderColor: "var(--c-border)", background: "var(--c-bg-surface)", padding: "16px 12px 24px" }}>
          {/* Campos del proceso */}
          <div className="mb-2.5 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3" style={{ color: "var(--c-accent-blue)" }} />
              <span className="flo-label">Campos del proceso</span>
            </div>
            <span className="flo-chip" style={{ background: "var(--c-bg-elevated)", color: "var(--c-text-muted)", padding: "1px 6px" }}>{usedFieldIds.size}/{processFields.length}</span>
          </div>
          {processFields.length === 0 ? (
            <p className="mb-2 px-1 text-[11px] leading-relaxed" style={{ color: "var(--c-text-placeholder)" }}>Sin campos todavía. Creá uno con el botón de abajo o arrastrá un elemento visual.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {processFields.map((f) => {
                const used = usedFieldIds.has(f.id);
                const FIcon = FIELD_TYPE_ICON[f.type] ?? TextIcon;
                const typeLabel = FIELD_TYPES.find((t) => t.value === f.type)?.label ?? f.type;
                return (
                  <div key={f.id}
                    onMouseDown={(e) => !used && onSpawnStart({ source: "field", field: f }, e)}
                    title={used ? "Ya está en la ventana" : `Arrastrá ${f.label} al lienzo`}
                    className={`flo-pitem flex items-center gap-2.5${used ? " is-used" : ""}`}
                    style={{ padding: "8px 10px" }}>
                    <span className="flo-icon-chip" style={{ width: 30, height: 30, background: "rgb(var(--c-accent-blue-rgb) / 0.13)", color: "var(--c-accent-blue)" }}>
                      <FIcon className="h-[15px] w-[15px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium" style={{ color: "var(--c-text-primary)" }}>{f.label}</div>
                      <div className="flo-label mt-px" style={{ letterSpacing: "0.04em" }}>{typeLabel}</div>
                    </div>
                    {used
                      ? <span className="flo-icon-chip" style={{ width: 18, height: 18, background: "rgb(var(--c-accent-emerald-rgb) / 0.15)", color: "var(--c-accent-emerald)" }}><Check className="h-3 w-3" /></span>
                      : <GripVertical className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-text-dim)" }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Nuevo campo de datos */}
          <div className="relative mt-2.5">
            <button type="button" onClick={() => setNewFieldMenu((v) => !v)}
              className="flo-ghost flex w-full items-center justify-center gap-2" style={{ height: 34, fontSize: 12.5 }}>
              <Plus className="h-3.5 w-3.5" /> Nuevo campo de datos
            </button>
            {newFieldMenu && (
              <div className="flo-popin absolute left-0 right-0 z-20 mt-1.5 rounded-[10px] p-1.5" style={{ background: "var(--c-bg-overlay)", border: "1px solid var(--c-border-strong)", boxShadow: "0 16px 40px rgb(0 0 0 / 0.5)" }}>
                <div className="mb-1 flex items-center justify-between px-1.5 pt-0.5">
                  <span className="flo-label">Tipo de campo nuevo</span>
                  <button type="button" onClick={() => setNewFieldMenu(false)} style={{ color: "var(--c-text-muted)" }}><X className="h-3 w-3" /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FIELD_TYPES.map((t) => {
                    const TIcon = FIELD_TYPE_ICON[t.value] ?? TextIcon;
                    return (
                      <button key={t.value} type="button" onClick={() => createField(t.value)}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] transition-colors hover:border-[var(--c-border-strong)]"
                        style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
                        <TIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-blue)" }} />
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="my-4 h-px" style={{ background: "var(--c-border)" }} />

          {/* Elementos visuales */}
          <div className="mb-2.5 flex items-center gap-1.5 px-1">
            <SquareDashed className="h-3 w-3" style={{ color: "var(--c-accent-violet)" }} />
            <span className="flo-label">Elementos visuales</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {PALETTE_ELEMENTS.map(({ kind, label, desc, Icon }) => (
              <div key={kind}
                onMouseDown={(e) => onSpawnStart({ source: "present", kind }, e)}
                title={`${desc} — arrastrá al lienzo`}
                className="flo-pitem flex items-center gap-2.5" style={{ padding: "9px 10px" }}>
                <span className="flo-icon-chip" style={{ width: 30, height: 30, background: "rgb(var(--c-accent-violet-rgb) / 0.14)", color: "var(--c-accent-violet)" }}>
                  <Icon className="h-[15px] w-[15px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium" style={{ color: "var(--c-text-primary)" }}>{label}</div>
                  <div className="truncate text-[11px]" style={{ color: "var(--c-text-muted)" }}>{desc}</div>
                </div>
                <GripVertical className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-text-dim)" }} />
              </div>
            ))}
          </div>

          {/* Capas — colapsable */}
          {layout.length > 0 && (
            <>
              <div className="my-4 h-px" style={{ background: "var(--c-border)" }} />
              <button type="button" onClick={() => setLayersOpen((v) => !v)} className="mb-2.5 flex w-full items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <LayoutTemplate className="h-3 w-3" style={{ color: "var(--c-text-muted)" }} />
                  <span className="flo-label">Capas · {layout.length}</span>
                </div>
                {layersOpen ? <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--c-text-muted)" }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--c-text-muted)" }} />}
              </button>
              {layersOpen && (
                <div className="flex flex-col gap-0.5">
                  {[...layout].reverse().map((el) => {
                    const isSel = el.id === selectedId;
                    const LIcon = el.kind === "field" ? (FIELD_TYPE_ICON[fieldOf(el.fieldId)?.type ?? "text"] ?? TextIcon) : PRESENT_ICON[el.kind as PresentKind];
                    const lbl = el.kind === "field" ? (fieldOf(el.fieldId)?.label ?? "(campo)") : ((el.text || PRESENT_LABEL[el.kind as PresentKind]).replace(/\{[^}]+\}/g, "…"));
                    return (
                      <div key={el.id}
                        onClick={() => setSelectedId(el.id)}
                        className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors"
                        style={{ background: isSel ? "rgb(var(--c-accent-blue-rgb) / 0.12)" : "transparent", border: `1px solid ${isSel ? "rgb(var(--c-accent-blue-rgb) / 0.4)" : "transparent"}`, color: isSel ? "var(--c-text-primary)" : "var(--c-text-secondary)" }}
                        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgb(var(--c-bg-overlay-rgb, 26 32 53) / 0.6)"; }}
                        onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                        <LIcon className="h-3.5 w-3.5 shrink-0" style={{ color: el.kind === "field" ? "var(--c-accent-blue)" : "var(--c-accent-violet)" }} />
                        <span className="flex-1 truncate">{lbl}</span>
                        {el.showWhen && <Filter className="h-3 w-3 shrink-0" style={{ color: "var(--c-accent-amber)" }} />}
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeEl(el.id); }} title="Eliminar" className="shrink-0 opacity-55 transition-opacity group-hover:opacity-100" style={{ color: "var(--c-text-dim)" }}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

          {/* Lienzo — área con grid + glow estilo app */}
          <div
            className="flex-1 overflow-auto p-8"
            style={{
              background: `
                linear-gradient(to right, rgb(var(--c-border-rgb) / 0.35) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, rgb(var(--c-border-rgb) / 0.35) 1px, transparent 1px) 0 0 / 32px 32px,
                radial-gradient(ellipse at 25% 15%, rgb(var(--c-accent-blue-rgb) / 0.10), transparent 55%),
                radial-gradient(ellipse at 80% 85%, rgb(var(--c-accent-violet-rgb) / 0.08), transparent 55%),
                var(--c-bg-base)`,
            }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            {/* Wrapper que reserva el espacio escalado (para que el scroll funcione con zoom) */}
            <div className="mx-auto" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
            {/* Hoja: la ventana que verá el ejecutor (WYSIWYG) */}
            <div
              ref={sheetRef}
              className="relative"
              style={{
                width: CANVAS_W, height: CANVAS_H,
                transform: `scale(${zoom})`, transformOrigin: "top left",
                background: `
                  linear-gradient(to right, rgb(var(--c-border-rgb) / 0.25) 1px, transparent 1px) 0 0 / 24px 24px,
                  linear-gradient(to bottom, rgb(var(--c-border-rgb) / 0.25) 1px, transparent 1px) 0 0 / 24px 24px,
                  var(--c-bg-surface)`,
                border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.2)",
                borderRadius: 12,
                boxShadow: "0 8px 40px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(var(--c-accent-blue-rgb) / 0.06)",
              }}
            >
              {layout.map((el) => (
                <div
                  key={el.id}
                  data-lid={el.id}
                  onMouseDown={() => setSelectedId(el.id)}
                  className="absolute transition-shadow"
                  style={{
                    left: el.x, top: el.y, width: el.w, height: el.h,
                    outline: selectedId === el.id ? "2px solid var(--c-accent-blue)" : "1px dashed rgb(var(--c-border-rgb) / 0.8)",
                    boxShadow: selectedId === el.id ? "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.3)" : undefined,
                    borderRadius: el.kind === "divider" ? 0 : 6,
                    // Las secciones van detrás (fondo); el resto encima.
                    zIndex: el.kind === "section" ? 1 : 2,
                    cursor: "move", boxSizing: "border-box", overflow: "hidden",
                  }}
                >
                  <LayoutElementPreview el={el} field={fieldOf(el.fieldId)} />
                </div>
              ))}
              {/* Toolbar flotante sobre el elemento seleccionado (no durante drag) */}
              {selected && !dragging && (
                <div
                  className="absolute"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    left: selected.x + selected.w / 2,
                    top: selected.y,
                    transform: `translate(-50%, calc(-100% - 8px)) scale(${1 / zoom})`,
                    transformOrigin: "center bottom",
                    zIndex: 30,
                  }}
                >
                  <div className="flo-ftoolbar">
                    <button type="button" onClick={() => duplicateEl(selected.id)} title="Duplicar (⌘D)">
                      <Copy className="h-[15px] w-[15px]" />
                    </button>
                    <button type="button" onClick={() => toggleCondition(selected.id)} title="Mostrar solo si…" style={selected.showWhen ? { color: "var(--c-accent-amber)" } : undefined}>
                      <Filter className="h-[15px] w-[15px]" />
                    </button>
                    <div className="sep" />
                    <button type="button" className="danger" onClick={() => removeEl(selected.id)} title="Eliminar (Supr)">
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                </div>
              )}
              {selected && (
                <Moveable
                  target={`[data-lid="${selected.id}"]`}
                  draggable
                  resizable
                  origin={false}
                  snappable
                  snapThreshold={7}
                  throttleDrag={0}
                  throttleResize={0}
                  zoom={zoom}
                  elementGuidelines={layout.filter((e) => e.id !== selected.id).map((e) => `[data-lid="${e.id}"]`)}
                  snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
                  elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
                  bounds={{ left: 0, top: 0, right: 0, bottom: 0, position: "css" }}
                  // Drag/resize SUAVE: durante el gesto movemos el DOM directo (sin
                  // setState → sin re-render por frame). Persistimos al soltar.
                  onDragStart={() => setDragging(true)}
                  onDrag={({ target, left, top }) => {
                    (target as HTMLElement).style.left = `${left}px`;
                    (target as HTMLElement).style.top = `${top}px`;
                  }}
                  onDragEnd={({ lastEvent }) => {
                    setDragging(false);
                    if (lastEvent) patchEl(selected.id, { x: Math.round(lastEvent.left), y: Math.round(lastEvent.top) });
                  }}
                  onResizeStart={() => setDragging(true)}
                  onResize={({ target, width, height, drag }) => {
                    const t = target as HTMLElement;
                    t.style.width = `${width}px`;
                    t.style.height = `${height}px`;
                    t.style.left = `${drag.left}px`;
                    t.style.top = `${drag.top}px`;
                  }}
                  onResizeEnd={({ lastEvent }) => {
                    setDragging(false);
                    if (lastEvent) patchEl(selected.id, { w: Math.round(lastEvent.width), h: Math.round(lastEvent.height), x: Math.round(lastEvent.drag.left), y: Math.round(lastEvent.drag.top) });
                  }}
                />
              )}
            </div>
            </div>

            {/* Controles de zoom — flotantes, no se escalan */}
            <div className="sticky bottom-0 left-0 flex items-center gap-1 rounded-lg p-1" style={{ position: "sticky", width: "fit-content", background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", boxShadow: "0 4px 16px rgb(0 0 0 / 0.3)" }}>
              <button type="button" onClick={() => zoomBy(-0.1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--c-bg-elevated)]" style={{ color: "var(--c-text-secondary)" }} title="Alejar"><Minus className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setZoom(1)} className="min-w-[44px] rounded px-2 py-1 text-[11px] font-mono hover:bg-[var(--c-bg-elevated)]" style={{ color: "var(--c-text-secondary)" }} title="Restablecer zoom">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => zoomBy(0.1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--c-bg-elevated)]" style={{ color: "var(--c-text-secondary)" }} title="Acercar"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {/* Inspector de propiedades */}
          <div className="flex shrink-0 flex-col border-l" style={{ width: 264, borderColor: "var(--c-border)", background: "var(--c-bg-surface)" }}>
            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center gap-3.5 px-7 text-center">
                <span className="flo-icon-chip" style={{ width: 48, height: 48, background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-dim)" }}>
                  <MousePointer2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="mb-1 text-[13.5px] font-medium" style={{ color: "var(--c-text-secondary)" }}>Nada seleccionado</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--c-text-muted)" }}>Elegí un elemento del lienzo para editar sus propiedades, o arrastrá uno desde la paleta.</p>
                </div>
              </div>
            ) : (() => {
              const f = selected.kind === "field" ? fieldOf(selected.fieldId) : undefined;
              const badgeIcon = selected.kind === "field" ? (FIELD_TYPE_ICON[f?.type ?? "text"] ?? TextIcon) : PRESENT_ICON[selected.kind as PresentKind];
              const isField = selected.kind === "field";
              const typeName = isField ? (FIELD_TYPES.find((t) => t.value === f?.type)?.label ?? "Campo") : PRESENT_LABEL[selected.kind as PresentKind];
              const BIcon = badgeIcon;
              return (
                <>
                  <div className="flo-scroll flex-1 overflow-y-auto px-4 pb-2.5 pt-4">
                    {/* Badge del elemento */}
                    <div className="mb-3.5 flex items-center gap-2.5">
                      <span className="flo-icon-chip" style={{ width: 34, height: 34, background: isField ? "rgb(var(--c-accent-blue-rgb) / 0.14)" : "rgb(var(--c-accent-violet-rgb) / 0.14)", color: isField ? "var(--c-accent-blue)" : "var(--c-accent-violet)" }}>
                        <BIcon className="h-[17px] w-[17px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>{typeName}</div>
                        <div className="flo-label mt-0.5" style={{ letterSpacing: "0.08em" }}>{isField ? "Campo del proceso" : "Elemento visual"}</div>
                      </div>
                    </div>

                    {/* ── Campo ── */}
                    {isField && f && (() => {
                      const isOptionType = OPTION_FIELD_TYPES.includes(f.type);
                      return (
                        <>
                          <PRow label="Etiqueta"><FloInput value={f.label} onChange={(v) => patchField(f.id, { label: v })} /></PRow>
                          <PRow label="Tipo de dato">
                            <div className="flo-select" style={{ height: 34, padding: 0 }}>
                              <select value={f.type} onChange={(e) => patchField(f.id, { type: e.target.value as FormFieldType })}
                                className="w-full bg-transparent outline-none" style={{ height: 34, padding: "0 10px", fontSize: 13, color: "var(--c-text-primary)", appearance: "none" }}>
                                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </div>
                          </PRow>
                          {(f.type === "text" || f.type === "textarea") && (
                            <PRow label="Placeholder"><FloInput value={f.placeholder ?? ""} onChange={(v) => patchField(f.id, { placeholder: v })} placeholder="Texto de ayuda…" /></PRow>
                          )}
                          {isOptionType && (
                            <PRow label="Opciones">
                              <div className="mb-2">
                                <Segmented value={f.source ? "dynamic" : "manual"} options={[{ value: "manual", label: "Manual" }, { value: "dynamic", label: "Dinámica" }]}
                                  onChange={(v) => patchField(f.id, { source: v === "manual" ? undefined : "employees" })} />
                              </div>
                              {!f.source ? (
                                <OptionsEditor options={f.options} onChange={(v) => patchField(f.id, { options: v })} />
                              ) : (
                                <>
                                  <div className="mb-2">
                                    <Segmented value={f.source} options={[{ value: "departments", label: "Depts" }, { value: "employees", label: "Empleados" }, { value: "divisions", label: "Divisiones" }]}
                                      onChange={(v) => patchField(f.id, { source: v })} />
                                  </div>
                                  <span className="flo-chip" style={{ background: "rgb(var(--c-accent-cyan-rgb) / 0.1)", color: "var(--c-accent-cyan)", padding: "4px 8px" }}>
                                    <Circle className="h-2.5 w-2.5" /> opciones dinámicas desde la org
                                  </span>
                                </>
                              )}
                            </PRow>
                          )}
                          <div style={{ height: 1, background: "var(--c-border)", margin: "4px 0 8px" }} />
                          <ToggleRow label="Obligatorio" value={f.required} onChange={(v) => patchField(f.id, { required: v })} Icon={Asterisk} />
                          <ToggleRow label="Solo lectura en este paso" value={selected.readOnly ?? false} onChange={(v) => patchEl(selected.id, { readOnly: v })} Icon={Lock} />
                        </>
                      );
                    })()}

                    {/* ── Título / Texto ── */}
                    {(selected.kind === "title" || selected.kind === "text") && (
                      <>
                        <PRow label="Texto">
                          <textarea className="flo-input flo-scroll w-full" value={selected.text ?? ""} onChange={(e) => patchEl(selected.id, { text: e.target.value }, 400)}
                            style={{ minHeight: 64, padding: "9px 10px", fontSize: 13, resize: "vertical", lineHeight: 1.4 }} />
                          <div className="mt-1.5"><DynInsert fields={processFields} onInsert={(tok) => patchEl(selected.id, { text: (selected.text ?? "") + (selected.text && !selected.text.endsWith(" ") ? " " : "") + tok })} /></div>
                        </PRow>
                        <PRow label="Tamaño de fuente">
                          <div className="flex items-center gap-2.5">
                            <input type="range" min={11} max={56} value={selected.fontSize ?? (selected.kind === "title" ? 22 : 13)}
                              onChange={(e) => patchEl(selected.id, { fontSize: Number(e.target.value) }, 200)} style={{ flex: 1, accentColor: "var(--c-accent-blue)" }} />
                            <span className="font-mono text-right text-xs" style={{ color: "var(--c-text-secondary)", width: 38 }}>{selected.fontSize ?? (selected.kind === "title" ? 22 : 13)}px</span>
                          </div>
                        </PRow>
                        <PRow label="Tipografía">
                          <div className="flo-select" style={{ height: 34, padding: 0 }}>
                            <select value={selected.fontFamily ?? ""} onChange={(e) => patchEl(selected.id, { fontFamily: e.target.value || undefined })}
                              className="w-full bg-transparent outline-none" style={{ height: 34, padding: "0 10px", fontSize: 13, color: "var(--c-text-primary)", appearance: "none" }}>
                              {FONT_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                        </PRow>
                        <PRow label="Peso">
                          <Segmented value={selected.fontWeight ?? (selected.kind === "title" ? 700 : 400)} options={[{ value: 400, label: "Regular" }, { value: 500, label: "Medium" }, { value: 700, label: "Bold" }]}
                            onChange={(v) => patchEl(selected.id, { fontWeight: v })} />
                        </PRow>
                        <PRow label="Alineación">
                          <Segmented value={selected.align ?? "left"} options={[{ value: "left", Icon: AlignLeft }, { value: "center", Icon: AlignCenter }, { value: "right", Icon: AlignRight }]}
                            onChange={(v) => patchEl(selected.id, { align: v })} />
                        </PRow>
                        <PRow label="Alineación vertical">
                          <Segmented value={selected.vAlign ?? "middle"} options={[{ value: "top", label: "Arriba" }, { value: "middle", label: "Medio" }, { value: "bottom", label: "Abajo" }]}
                            onChange={(v) => patchEl(selected.id, { vAlign: v })} />
                        </PRow>
                        <PRow label="Color">
                          <ColorSwatches value={selected.color} onChange={(v) => patchEl(selected.id, { color: v })} swatches={TEXT_COLOR_SWATCHES} />
                        </PRow>
                      </>
                    )}

                    {/* ── Divisor ── */}
                    {selected.kind === "divider" && (
                      <>
                        <PRow label="Grosor">
                          <div className="flex items-center gap-2.5">
                            <input type="range" min={1} max={6} value={selected.thickness ?? 2} onChange={(e) => patchEl(selected.id, { thickness: Number(e.target.value) }, 200)} style={{ flex: 1, accentColor: "var(--c-accent-blue)" }} />
                            <span className="font-mono text-right text-xs" style={{ color: "var(--c-text-secondary)", width: 32 }}>{selected.thickness ?? 2}px</span>
                          </div>
                        </PRow>
                        <PRow label="Color"><ColorSwatches value={selected.color} onChange={(v) => patchEl(selected.id, { color: v })} swatches={DIVIDER_COLOR_SWATCHES} /></PRow>
                      </>
                    )}

                    {/* ── Sección ── */}
                    {selected.kind === "section" && (
                      <>
                        <PRow label="Título de la sección" hint="Dejalo vacío para una caja sin título."><FloInput value={selected.text ?? ""} onChange={(v) => patchEl(selected.id, { text: v }, 400)} placeholder="Sección" /></PRow>
                        <PRow label="Opacidad del relleno">
                          <div className="flex items-center gap-2.5">
                            <input type="range" min={0} max={100} value={Math.round((selected.fill ?? 0.4) * 100)} onChange={(e) => patchEl(selected.id, { fill: Number(e.target.value) / 100 }, 200)} style={{ flex: 1, accentColor: "var(--c-accent-blue)" }} />
                            <span className="font-mono text-right text-xs" style={{ color: "var(--c-text-secondary)", width: 38 }}>{Math.round((selected.fill ?? 0.4) * 100)}%</span>
                          </div>
                        </PRow>
                        <p className="text-[11px] leading-snug" style={{ color: "var(--c-text-dim)" }}>Caja de fondo para agrupar campos. Posicioná los campos encima.</p>
                      </>
                    )}

                    {/* ── Imagen ── */}
                    {selected.kind === "image" && (
                      <>
                        <PRow label="Imagen" hint="Subí un archivo o pegá un enlace.">
                          <label className="flo-ghost flex cursor-pointer items-center justify-center gap-2" style={{ height: 34, fontSize: 12.5 }}>
                            {uploadingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {uploadingImg ? "Subiendo…" : "Subir archivo"}
                            <input type="file" accept="image/*" className="hidden" disabled={uploadingImg}
                              onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadImage(selected.id, file); e.target.value = ""; }} />
                          </label>
                          <div className="mt-1.5"><FloInput value={selected.src ?? ""} onChange={(v) => patchEl(selected.id, { src: v }, 400)} placeholder="https://…" /></div>
                        </PRow>
                        <PRow label="Ajuste">
                          <Segmented value={selected.imageFit ?? "contain"} options={[{ value: "contain", label: "Contener" }, { value: "cover", label: "Cubrir" }]} onChange={(v) => patchEl(selected.id, { imageFit: v })} />
                        </PRow>
                        {selected.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={selected.src} alt="" className="max-h-24 w-full rounded object-contain" style={{ background: "var(--c-bg-elevated)" }} />
                        ) : null}
                      </>
                    )}

                    <div style={{ height: 1, background: "var(--c-border)", margin: "6px 0 14px" }} />

                    {/* Visibilidad condicional */}
                    <ConditionEditor
                      selfId={selected.id}
                      layout={layout}
                      processFields={processFields}
                      showWhen={selected.showWhen}
                      onChange={(sw) => patchEl(selected.id, { showWhen: sw })}
                    />

                    {/* Posición y tamaño */}
                    <div className="mt-4">
                      <div className="flo-label mb-2">Posición y tamaño</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <NumField label="X" value={selected.x} onChange={(v) => patchEl(selected.id, { x: v })} />
                        <NumField label="Y" value={selected.y} onChange={(v) => patchEl(selected.id, { y: v })} />
                        <NumField label="W" value={selected.w} onChange={(v) => patchEl(selected.id, { w: Math.max(20, v) })} />
                        <NumField label="H" value={selected.h} onChange={(v) => patchEl(selected.id, { h: Math.max(16, v) })} />
                      </div>
                    </div>
                  </div>

                  {/* Footer — duplicar / eliminar */}
                  <div className="flex gap-2 border-t px-4 py-3" style={{ borderColor: "var(--c-border)" }}>
                    <button type="button" onClick={() => duplicateEl(selected.id)} className="flo-ghost flex flex-1 items-center justify-center gap-1.5" style={{ height: 36, fontSize: 12.5 }}>
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </button>
                    <button type="button" onClick={() => removeEl(selected.id)} className="flo-ghost flex flex-1 items-center justify-center gap-1.5" style={{ height: 36, fontSize: 12.5, color: "var(--c-accent-red)", borderColor: "rgb(var(--c-accent-red-rgb) / 0.3)" }}>
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Ghost del elemento mientras se arrastra desde la paleta */}
        {spawn && spawn.moved && (() => {
          const GIcon = spawn.icon;
          return (
            <div className="pointer-events-none fixed z-[60]" style={{ left: spawn.x + 14, top: spawn.y + 10 }}>
              <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "var(--c-bg-overlay)", border: "1px solid var(--c-border-strong)", boxShadow: "0 8px 24px rgb(0 0 0 / 0.5)" }}>
                <GIcon className="h-4 w-4" style={{ color: spawn.accent }} />
                <span className="text-xs" style={{ color: "var(--c-text-primary)" }}>{spawn.label}</span>
              </div>
            </div>
          );
        })()}

        {/* Vista previa — la ventana como la verá quien ejecuta el paso */}
        {preview && (
          <StepPreview layout={layout} processFields={processFields} onClose={() => setPreview(false)} />
        )}
      </div>
  );
}

// ─── Vista previa (runtime simulado, read-only) ───────────────────────────────
// Muestra la ventana del paso como la verá el ejecutor: evalúa condiciones
// (showWhen) y texto dinámico ({campo}) contra valores de ejemplo por campo.
function sampleValueFor(f: FormField): unknown {
  switch (f.type) {
    case "number": return "123";
    case "currency": return "1500.5";
    case "date": return new Date().toISOString().slice(0, 10);
    case "checkbox": return true;
    case "select":
    case "radio": return f.options?.[0] ?? (f.source ? "—" : "Opción A");
    case "multiselect": return f.options?.slice(0, 2) ?? ["Opción A", "Opción B"];
    case "textarea": return "Texto de ejemplo más largo para previsualizar el campo.";
    case "file": return "documento.pdf";
    default: return `Ej. ${f.label}`;
  }
}

function PreviewField({ field, value }: { field: FormField; value: unknown }) {
  const box = { background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 8, color: "var(--c-text-primary)" } as const;
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
        <span className="flex h-4 w-4 items-center justify-center rounded" style={{ background: value ? "var(--c-accent-blue)" : "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
          {value ? <Check className="h-3 w-3 text-white" /> : null}
        </span>
        {field.label}
      </label>
    );
  }
  if (field.type === "textarea") {
    return <div className="w-full px-3 py-2 text-xs" style={{ ...box, minHeight: 56 }}>{String(value ?? "")}</div>;
  }
  if (field.type === "currency") {
    const n = Number(value ?? 0);
    const fmt = isNaN(n) ? String(value) : n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
    return <div className="flex h-9 items-center px-3 text-sm" style={box}>$ {fmt}</div>;
  }
  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1">
        {arr.map((v, i) => <span key={i} className="rounded px-2 py-1 text-[11px]" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.12)", color: "var(--c-accent-blue)" }}>{String(v)}</span>)}
      </div>
    );
  }
  return <div className="flex h-9 items-center px-3 text-sm" style={box}>{String(value ?? "")}</div>;
}

function StepPreview({ layout, processFields, onClose }: { layout: LayoutElement[]; processFields: FormField[]; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const calc = () => setScale(Math.min(1, (window.innerHeight - 160) / CANVAS_H, (window.innerWidth - 140) / CANVAS_W));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const values: Record<string, unknown> = {};
  for (const f of processFields) values[f.id] = sampleValueFor(f);
  const interpFields = processFields.map((f) => ({ id: f.id, label: f.label }));
  const fieldById = new Map(processFields.map((f) => [f.id, f]));

  const visible = layout.filter((el) => evalShowWhen(el.showWhen, values));
  const hidden = layout.length - visible.length;

  return (
    <div className="fadein fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4" style={{ background: "rgb(4 6 12 / 0.82)", backdropFilter: "blur(8px)" }} onMouseDown={onClose}>
      <div className="absolute left-0 right-0 top-0 flex h-14 items-center justify-between px-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-accent-emerald-rgb) / 0.15)", color: "var(--c-accent-emerald)" }}><Eye className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>Vista previa</p>
            <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>como lo ve quien ejecuta el paso</p>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors hover:bg-[var(--c-bg-elevated)]" style={{ border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
          <X className="h-4 w-4" /> Cerrar
        </button>
      </div>

      <div onMouseDown={(e) => e.stopPropagation()} style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H, background: "var(--c-bg-surface)", borderRadius: 16, border: "1px solid var(--c-border-strong)", boxShadow: "0 30px 90px rgb(0 0 0 / 0.7)", overflow: "hidden" }}>
          {visible.map((el) => {
            const common = { position: "absolute" as const, left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.kind === "section" ? 1 : 2 };
            if (el.kind === "divider") return <div key={el.id} style={{ ...common, display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: Math.max(1, el.thickness ?? 2), background: resolveColor(el.color, "var(--c-border)") }} /></div>;
            if (el.kind === "section") return (
              <div key={el.id} style={{ ...common, borderRadius: 12, border: "1px solid var(--c-border)", background: `rgb(var(--c-border-rgb) / ${el.fill ?? 0.4})` }}>
                {el.text && <span className="flo-label absolute left-3.5 top-2.5">{el.text}</span>}
              </div>
            );
            if (el.kind === "image") return el.src
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={el.id} src={el.src} alt="" style={{ ...common, objectFit: el.imageFit ?? "contain", borderRadius: 8 }} />
              : null;
            if (el.kind === "title" || el.kind === "text") {
              const vItems = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
              return (
                <div key={el.id} style={{ ...common, display: "flex", flexDirection: "column", justifyContent: vItems, fontSize: el.fontSize ?? (el.kind === "title" ? 22 : 13), fontWeight: el.fontWeight ?? (el.kind === "title" ? 700 : 400), fontFamily: el.fontFamily ?? "inherit", color: resolveColor(el.color, el.kind === "title" ? "var(--c-text-primary)" : "var(--c-text-muted)"), textAlign: el.align ?? "left" }}>
                  {interpolate(el.text ?? "", interpFields, values)}
                </div>
              );
            }
            // field
            const field = el.fieldId ? fieldById.get(el.fieldId) : undefined;
            if (!field) return null;
            return (
              <div key={el.id} style={{ ...common, display: "flex", flexDirection: "column", gap: 4 }}>
                {field.type !== "checkbox" && (
                  <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
                    {field.label}
                    {field.required && el.readOnly !== true && <span style={{ color: "var(--c-accent-red)" }}>*</span>}
                    {el.readOnly && <span className="rounded px-1 py-0.5 font-mono text-[8px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)", color: "var(--c-accent-amber)" }}>solo lectura</span>}
                  </label>
                )}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <PreviewField field={field} value={values[field.id]} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hidden > 0 && (
        <div onMouseDown={(e) => e.stopPropagation()} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.1)", color: "var(--c-accent-amber)", border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.25)" }}>
          <Filter className="h-3.5 w-3.5" /> {hidden} elemento{hidden > 1 ? "s" : ""} oculto{hidden > 1 ? "s" : ""} por condiciones · valores de ejemplo
        </div>
      )}
    </div>
  );
}

// Editor de visibilidad condicional de un elemento ("mostrar solo si...").
function ConditionEditor({
  selfId,
  layout,
  processFields,
  showWhen,
  onChange,
}: {
  selfId: string;
  layout: LayoutElement[];
  processFields: FormField[];
  showWhen?: ShowWhen;
  onChange: (sw: ShowWhen | undefined) => void;
}) {
  // Campos disponibles como disparador: los campos del proceso presentes en el
  // layout (excepto el propio elemento). Sin campos → no se puede condicionar.
  const sourceFields = layout
    .filter((e) => e.kind === "field" && e.id !== selfId && e.fieldId)
    .map((e) => ({ fieldId: e.fieldId!, label: processFields.find((f) => f.id === e.fieldId)?.label ?? "(campo)" }));

  const enabled = !!showWhen;
  const needsValue = showWhen && showWhen.operator !== "isFilled" && showWhen.operator !== "isEmpty";
  const srcField = showWhen ? processFields.find((f) => f.id === showWhen.fieldId) : undefined;

  const OPS: { value: ConditionOperator; label: string }[] = [
    { value: "equals", label: "es igual a" },
    { value: "notEquals", label: "es distinto de" },
    { value: "includes", label: "contiene" },
    { value: "isFilled", label: "está completo" },
    { value: "isEmpty", label: "está vacío" },
  ];

  const selStyle = { background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)", appearance: "none" as const };
  return (
    <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.05)", border: `1px solid ${enabled ? "rgb(var(--c-accent-amber-rgb) / 0.3)" : "var(--c-border)"}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" style={{ color: "var(--c-accent-amber)" }} />
          <span className="text-[12.5px] font-medium" style={{ color: "var(--c-text-secondary)" }}>Mostrar solo si…</span>
        </div>
        <div className={`flo-switch${enabled ? " on amber" : ""}`} onClick={() => onChange(enabled ? undefined : { fieldId: sourceFields[0]?.fieldId ?? "", operator: "equals", value: "" })}><span className="knob" /></div>
      </div>
      {enabled && (
        sourceFields.length === 0 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--c-text-placeholder)" }}>
            Agregá otro campo al lienzo para usarlo como condición.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="flo-select" style={{ height: 32, padding: 0 }}>
              <select value={showWhen!.fieldId} onChange={(e) => onChange({ ...showWhen!, fieldId: e.target.value })}
                className="w-full bg-transparent outline-none" style={{ ...selStyle, height: 32, padding: "0 10px", fontSize: 12.5, border: "none" }}>
                {sourceFields.map((s) => <option key={s.fieldId} value={s.fieldId}>{s.label}</option>)}
              </select>
            </div>
            <div className="flo-select" style={{ height: 32, padding: 0 }}>
              <select value={showWhen!.operator} onChange={(e) => onChange({ ...showWhen!, operator: e.target.value as ConditionOperator })}
                className="w-full bg-transparent outline-none" style={{ ...selStyle, height: 32, padding: "0 10px", fontSize: 12.5, border: "none" }}>
                {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {needsValue && (() => {
              const opts = srcField?.type === "select" && !srcField.source ? (srcField.options ?? []) : null;
              return opts ? (
                <div className="flo-select" style={{ height: 32, padding: 0 }}>
                  <select value={showWhen!.value ?? ""} onChange={(e) => onChange({ ...showWhen!, value: e.target.value })}
                    className="w-full bg-transparent outline-none" style={{ ...selStyle, height: 32, padding: "0 10px", fontSize: 12.5, border: "none" }}>
                    <option value="">— Valor —</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ) : (
                <FloInput value={showWhen!.value ?? ""} onChange={(v) => onChange({ ...showWhen!, value: v })} placeholder="Valor…" />
              );
            })()}
          </div>
        )
      )}
    </div>
  );
}

// Preview de un elemento dentro del lienzo del builder (no interactivo).
function LayoutElementPreview({ el, field }: { el: LayoutElement; field?: FormField }) {
  if (el.kind === "divider") {
    return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: Math.max(1, el.thickness ?? 2), background: resolveColor(el.color, "var(--c-border)") }} /></div>;
  }
  if (el.kind === "section") {
    return (
      <div style={{ width: "100%", height: "100%", borderRadius: 12, border: "1px solid var(--c-border)", background: `rgb(var(--c-border-rgb) / ${el.fill ?? 0.4})`, position: "relative" }}>
        {el.text && <span className="flo-label" style={{ position: "absolute", top: 10, left: 14 }}>{el.text}</span>}
      </div>
    );
  }
  if (el.kind === "image") {
    return el.src
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: el.imageFit ?? "contain", borderRadius: 8, display: "block" }} />
      : (
        <div style={{ width: "100%", height: "100%", borderRadius: 8, border: "1px solid var(--c-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--c-text-muted)", background: "repeating-linear-gradient(135deg, rgb(var(--c-accent-violet-rgb) / 0.05) 0 8px, rgb(var(--c-border-rgb) / 0.4) 8px 16px)" }}>
          <ImageIcon className="h-5 w-5" />
          <span className="flo-label">imagen</span>
        </div>
      );
  }
  if (el.kind === "title" || el.kind === "text") {
    const vAlignItems = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: vAlignItems, padding: "2px 6px", overflow: "hidden" }}>
        <div style={{
          fontSize: el.fontSize ?? (el.kind === "title" ? 22 : 13),
          fontWeight: el.fontWeight ?? (el.kind === "title" ? 700 : 400),
          fontFamily: el.fontFamily ?? "inherit",
          color: resolveColor(el.color, el.kind === "title" ? "var(--c-text-primary)" : "var(--c-text-muted)"),
          textAlign: el.align ?? "left", lineHeight: 1.2, letterSpacing: el.kind === "title" ? "-0.01em" : "0",
        }}>
          {el.text || (el.kind === "title" ? "Título" : "Texto")}
        </div>
      </div>
    );
  }
  // field
  return (
    <div style={{ width: "100%", height: "100%", padding: 6, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
      <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--c-text-secondary)" }}>
        {field?.label ?? "(campo eliminado)"}
        {field?.required && <Asterisk className="h-2 w-2" style={{ color: "var(--c-accent-red)" }} />}
        {el.readOnly && <span className="flo-chip" style={{ background: "var(--c-bg-elevated)", color: "var(--c-text-muted)", padding: "1px 5px", fontSize: 8 }}><Lock className="h-2 w-2" /> solo lec.</span>}
      </span>
      <div className="flex-1 rounded-lg" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", minHeight: 8 }} />
    </div>
  );
}
