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
} from "lucide-react";
import Moveable from "react-moveable";
import { evalShowWhen, interpolate } from "@/lib/form-conditions";
import type {
  FormField, FormFieldType, LayoutElement, ShowWhen, ConditionOperator,
} from "@/lib/process-types";
import { FIELD_TYPES, OPTION_FIELD_TYPES } from "./field-config";

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
        {/* Paleta — arrastrá al lienzo (o click para agregar arriba) */}
        <div className="w-60 shrink-0 overflow-y-auto border-r p-4" style={{ borderColor: "var(--c-border)", background: "var(--c-bg-surface)" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Campos del proceso</p>
            <span className="rounded px-1.5 py-0.5 font-mono text-[9px]" style={{ background: "var(--c-bg-elevated)", color: "var(--c-text-muted)" }}>{usedFieldIds.size}/{processFields.length}</span>
          </div>
          {processFields.length === 0 ? (
            <p className="mb-2 text-[10px] leading-relaxed" style={{ color: "var(--c-text-placeholder)" }}>Sin campos todavía. Creá uno con el botón de abajo o arrastrá un elemento visual.</p>
          ) : (
            <div className="mb-2 flex flex-col gap-1">
              {processFields.map((f) => {
                const used = usedFieldIds.has(f.id);
                const FIcon = FIELD_TYPE_ICON[f.type] ?? TextIcon;
                return (
                  <div key={f.id}
                    onMouseDown={(e) => !used && onSpawnStart({ source: "field", field: f }, e)}
                    title={used ? "Ya está en la ventana" : `Arrastrá ${f.label} al lienzo`}
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] transition-colors hover:border-[var(--c-accent-blue)]"
                    style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)", cursor: used ? "default" : "grab", opacity: used ? 0.4 : 1, userSelect: "none" }}>
                    {used
                      ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-emerald)" }} />
                      : <FIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-blue)" }} />}
                    <span className="flex-1 truncate" title={f.label}>{f.label}</span>
                    {!used && <GripVertical className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-text-dim)" }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Nuevo campo de datos — crea un FormField en el proceso + lo coloca */}
          <div className="relative mb-4">
            <button type="button" onClick={() => setNewFieldMenu((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--c-bg-elevated)]"
              style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.08)", border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.25)", color: "var(--c-accent-blue)" }}>
              <Plus className="h-3.5 w-3.5" /> Nuevo campo de datos
            </button>
            {newFieldMenu && (
              <div className="absolute left-0 right-0 z-20 mt-1.5 rounded-lg p-1.5" style={{ background: "var(--c-bg-overlay)", border: "1px solid var(--c-border-strong)", boxShadow: "0 16px 40px rgb(0 0 0 / 0.5)" }}>
                <div className="mb-1 flex items-center justify-between px-1.5 pt-0.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Tipo de campo</span>
                  <button type="button" onClick={() => setNewFieldMenu(false)} style={{ color: "var(--c-text-muted)" }}><X className="h-3 w-3" /></button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {FIELD_TYPES.map((t) => {
                    const TIcon = FIELD_TYPE_ICON[t.value] ?? TextIcon;
                    return (
                      <button key={t.value} type="button" onClick={() => createField(t.value)}
                        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[10px] transition-colors hover:border-[var(--c-accent-blue)]"
                        style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}>
                        <TIcon className="h-3 w-3 shrink-0" style={{ color: "var(--c-accent-blue)" }} />
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Elementos visuales</p>
          <div className="flex flex-col gap-1.5">
            {PALETTE_ELEMENTS.map(({ kind, label, desc, Icon }) => (
              <div key={kind}
                onMouseDown={(e) => onSpawnStart({ source: "present", kind }, e)}
                title={`${desc} — arrastrá al lienzo`}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:border-[var(--c-accent-violet)]"
                style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", cursor: "grab", userSelect: "none" }}>
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded" style={{ background: "rgb(var(--c-accent-violet-rgb) / 0.12)" }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: "var(--c-accent-violet)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium" style={{ color: "var(--c-text-secondary)" }}>{label}</p>
                  <p className="text-[9px] leading-tight" style={{ color: "var(--c-text-muted)" }}>{desc}</p>
                </div>
                <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-text-dim)" }} />
              </div>
            ))}
          </div>

          {/* Capas — lista de elementos del lienzo */}
          {layout.length > 0 && (
            <>
              <p className="mb-2 mt-5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
                <Layers className="h-3 w-3" /> Capas
              </p>
              <div className="flex flex-col gap-0.5">
                {layout.map((el) => {
                  const isSel = el.id === selectedId;
                  const LIcon = el.kind === "field" ? (FIELD_TYPE_ICON[fieldOf(el.fieldId)?.type ?? "text"] ?? TextIcon) : PRESENT_ICON[el.kind as PresentKind];
                  const lbl = el.kind === "field" ? (fieldOf(el.fieldId)?.label ?? "(campo)") : (el.text || PRESENT_LABEL[el.kind as PresentKind]);
                  return (
                    <div key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors"
                      style={{ background: isSel ? "rgb(var(--c-accent-blue-rgb) / 0.12)" : "transparent", border: `1px solid ${isSel ? "var(--c-accent-blue)" : "transparent"}`, color: isSel ? "var(--c-accent-blue)" : "var(--c-text-secondary)" }}>
                      <LIcon className="h-3.5 w-3.5 shrink-0" style={{ color: el.kind === "field" ? "var(--c-accent-blue)" : "var(--c-accent-violet)" }} />
                      <span className="flex-1 truncate">{lbl}</span>
                      {el.showWhen && <Filter className="h-3 w-3 shrink-0" style={{ color: "var(--c-accent-amber)" }} />}
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeEl(el.id); }} title="Eliminar" className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--c-accent-red)" }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
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
                  <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: "var(--c-bg-overlay)", border: "1px solid var(--c-border-strong)", boxShadow: "0 8px 24px rgb(0 0 0 / 0.5)" }}>
                    <button type="button" onClick={() => duplicateEl(selected.id)} title="Duplicar (⌘D)" className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--c-bg-elevated)]" style={{ color: "var(--c-text-secondary)" }}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => toggleCondition(selected.id)} title="Mostrar solo si…" className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--c-bg-elevated)]" style={{ color: selected.showWhen ? "var(--c-accent-amber)" : "var(--c-text-secondary)" }}>
                      <Filter className="h-3.5 w-3.5" />
                    </button>
                    <div className="mx-0.5 h-4 w-px" style={{ background: "var(--c-border)" }} />
                    <button type="button" onClick={() => removeEl(selected.id)} title="Eliminar (Supr)" className="flex h-7 w-7 items-center justify-center rounded hover:bg-[rgb(var(--c-accent-red-rgb)/0.15)]" style={{ color: "var(--c-accent-red)" }}>
                      <Trash2 className="h-3.5 w-3.5" />
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

          {/* Propiedades del elemento */}
          <div className="w-56 shrink-0 overflow-y-auto border-l p-3" style={{ borderColor: "var(--c-border)" }}>
            {!selected ? (
              <p className="text-[11px]" style={{ color: "var(--c-text-muted)" }}>Seleccioná un elemento del lienzo para editar sus propiedades.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase" style={{ color: "var(--c-text-muted)" }}>
                    {selected.kind === "field" ? "Campo" : selected.kind === "title" ? "Título" : selected.kind === "text" ? "Texto" : selected.kind === "section" ? "Sección" : selected.kind === "image" ? "Imagen" : "Divisor"}
                  </p>
                  <button type="button" onClick={() => removeEl(selected.id)} title="Eliminar" style={{ color: "var(--c-accent-red)" }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {selected.kind === "field" && (() => {
                  const f = fieldOf(selected.fieldId);
                  if (!f) return <p className="text-[11px]" style={{ color: "var(--c-accent-red)" }}>Campo eliminado del proceso.</p>;
                  const isOptionType = OPTION_FIELD_TYPES.includes(f.type);
                  return (
                    <>
                      <label className="font-mono text-[9px] uppercase" style={{ color: "var(--c-text-muted)" }}>Etiqueta</label>
                      <input
                        value={f.label}
                        onChange={(e) => patchField(f.id, { label: e.target.value })}
                        className="w-full rounded px-2 py-1 text-xs outline-none"
                        style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                      />
                      <label className="font-mono text-[9px] uppercase" style={{ color: "var(--c-text-muted)" }}>Tipo de dato</label>
                      <select
                        value={f.type}
                        onChange={(e) => patchField(f.id, { type: e.target.value as FormFieldType })}
                        className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                        style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                      >
                        {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--c-text-muted)", cursor: "pointer" }}>
                        <input type="checkbox" checked={f.required} onChange={(e) => patchField(f.id, { required: e.target.checked })} />
                        Obligatorio
                      </label>
                      <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--c-text-muted)", cursor: "pointer" }}>
                        <input type="checkbox" checked={selected.readOnly ?? false} onChange={(e) => patchEl(selected.id, { readOnly: e.target.checked })} />
                        Solo lectura en este paso
                      </label>
                      {isOptionType && (
                        <>
                          <div className="flex gap-1">
                            {(["manual", "departments", "employees", "divisions"] as const).map((opt) => {
                              const active = opt === "manual" ? !f.source : f.source === opt;
                              const labels: Record<string, string> = { manual: "Manual", departments: "Depts", employees: "Empl.", divisions: "Divis." };
                              return (
                                <button key={opt} type="button"
                                  onClick={() => patchField(f.id, { source: opt === "manual" ? undefined : (opt as "departments" | "employees" | "divisions") })}
                                  className="flex-1 rounded px-1 py-0.5 text-[9px] transition-colors"
                                  style={{ background: active ? "rgb(var(--c-accent-blue-rgb) / 0.13)" : "var(--c-bg-elevated)", border: `1px solid ${active ? "var(--c-accent-blue)" : "var(--c-border)"}`, color: active ? "var(--c-accent-blue)" : "var(--c-text-muted)" }}>
                                  {labels[opt]}
                                </button>
                              );
                            })}
                          </div>
                          {!f.source ? (
                            <input
                              value={(f.options ?? []).join(", ")}
                              onChange={(e) => patchField(f.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                              placeholder="Opción 1, Opción 2…"
                              className="w-full rounded px-2 py-1 text-[10px] outline-none"
                              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}
                            />
                          ) : (
                            <p className="text-[9px]" style={{ color: "var(--c-text-muted)" }}>Opciones dinámicas desde {f.source === "departments" ? "departamentos" : f.source === "employees" ? "empleados" : "divisiones"} de la org.</p>
                          )}
                        </>
                      )}
                      {(f.type === "text" || f.type === "textarea" || f.type === "number") && (
                        <input
                          value={f.placeholder ?? ""}
                          onChange={(e) => patchField(f.id, { placeholder: e.target.value })}
                          placeholder="Placeholder (opcional)"
                          className="w-full rounded px-2 py-1 text-[10px] outline-none"
                          style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-secondary)" }}
                        />
                      )}
                    </>
                  );
                })()}

                {(selected.kind === "title" || selected.kind === "text") && (
                  <>
                    <textarea
                      value={selected.text ?? ""}
                      onChange={(e) => patchEl(selected.id, { text: e.target.value }, 400)}
                      rows={2}
                      className="w-full rounded px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)", resize: "none" }}
                    />
                    <label className="flex items-center justify-between text-[11px]" style={{ color: "var(--c-text-muted)" }}>
                      Tamaño
                      <input type="number" value={selected.fontSize ?? 14} min={9} max={48}
                        onChange={(e) => patchEl(selected.id, { fontSize: Number(e.target.value) })}
                        className="w-16 rounded px-1.5 py-0.5 text-xs outline-none" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }} />
                    </label>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <button key={a} type="button" onClick={() => patchEl(selected.id, { align: a })}
                          className="flex-1 rounded px-1 py-0.5 text-[9px]"
                          style={{ background: (selected.align ?? "left") === a ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-elevated)", border: `1px solid ${(selected.align ?? "left") === a ? "var(--c-accent-blue)" : "var(--c-border)"}`, color: (selected.align ?? "left") === a ? "var(--c-accent-blue)" : "var(--c-text-muted)" }}>
                          {a === "left" ? "Izq" : a === "center" ? "Centro" : "Der"}
                        </button>
                      ))}
                    </div>
                    {/* Alineación vertical */}
                    <div className="flex gap-1">
                      {(["top", "middle", "bottom"] as const).map((a) => (
                        <button key={a} type="button" onClick={() => patchEl(selected.id, { vAlign: a })}
                          className="flex-1 rounded px-1 py-0.5 text-[9px]"
                          style={{ background: (selected.vAlign ?? "middle") === a ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-elevated)", border: `1px solid ${(selected.vAlign ?? "middle") === a ? "var(--c-accent-blue)" : "var(--c-border)"}`, color: (selected.vAlign ?? "middle") === a ? "var(--c-accent-blue)" : "var(--c-text-muted)" }}>
                          {a === "top" ? "Arriba" : a === "middle" ? "Medio" : "Abajo"}
                        </button>
                      ))}
                    </div>
                    {/* Tipografía */}
                    <select
                      value={selected.fontFamily ?? ""}
                      onChange={(e) => patchEl(selected.id, { fontFamily: e.target.value || undefined })}
                      className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                    >
                      {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                    </select>
                  </>
                )}

                {selected.kind === "image" && (
                  <>
                    {/* Subida directa */}
                    <label
                      className="flex cursor-pointer items-center justify-center gap-2 rounded px-2 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--c-bg-elevated)]"
                      style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.1)", border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.25)", color: "var(--c-accent-blue)" }}
                    >
                      {uploadingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {uploadingImg ? "Subiendo…" : "Subir imagen"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingImg}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(selected.id, f); e.target.value = ""; }}
                      />
                    </label>
                    <label className="font-mono text-[9px] uppercase" style={{ color: "var(--c-text-muted)" }}>…o pegá una URL</label>
                    <input
                      value={selected.src ?? ""}
                      onChange={(e) => patchEl(selected.id, { src: e.target.value }, 400)}
                      placeholder="https://…"
                      className="w-full rounded px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                    />
                    {selected.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.src} alt="" className="max-h-24 w-full rounded object-contain" style={{ background: "var(--c-bg-elevated)" }} />
                    ) : null}
                  </>
                )}

                {selected.kind === "section" && (
                  <>
                    <label className="font-mono text-[9px] uppercase" style={{ color: "var(--c-text-muted)" }}>Título de la sección</label>
                    <input
                      value={selected.text ?? ""}
                      onChange={(e) => patchEl(selected.id, { text: e.target.value }, 400)}
                      placeholder="Sección"
                      className="w-full rounded px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                    />
                    <p className="text-[10px]" style={{ color: "var(--c-text-muted)" }}>Caja de fondo para agrupar campos. Posicioná los campos encima.</p>
                  </>
                )}

                {/* Visibilidad condicional — mostrar este elemento solo si... */}
                <ConditionEditor
                  selfId={selected.id}
                  layout={layout}
                  processFields={processFields}
                  showWhen={selected.showWhen}
                  onChange={(sw) => patchEl(selected.id, { showWhen: sw })}
                />

                <div className="grid grid-cols-2 gap-1.5 text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <label key={k} className="flex items-center justify-between gap-1">
                      <span className="uppercase">{k}</span>
                      <input type="number" value={Math.round(selected[k] as number)}
                        onChange={(e) => patchEl(selected.id, { [k]: Number(e.target.value) } as Partial<LayoutElement>)}
                        className="w-12 rounded px-1 py-0.5 text-[10px] outline-none" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }} />
                    </label>
                  ))}
                </div>
              </div>
            )}
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
            if (el.kind === "divider") return <div key={el.id} style={{ ...common, display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: 2, background: "var(--c-border)" }} /></div>;
            if (el.kind === "section") return (
              <div key={el.id} style={{ ...common, borderRadius: 10, border: "1px solid var(--c-border)", background: "rgb(var(--c-border-rgb) / 0.05)" }}>
                {el.text && <span className="absolute -top-2 left-3 px-1.5 font-mono text-[9px] uppercase" style={{ background: "var(--c-bg-surface)", color: "var(--c-text-muted)" }}>{el.text}</span>}
              </div>
            );
            if (el.kind === "image") return el.src
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={el.id} src={el.src} alt="" style={{ ...common, objectFit: "contain" }} />
              : null;
            if (el.kind === "title" || el.kind === "text") {
              const vItems = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
              return (
                <div key={el.id} style={{ ...common, display: "flex", alignItems: vItems, fontSize: el.fontSize ?? (el.kind === "title" ? 22 : 13), fontWeight: el.kind === "title" ? 700 : 400, fontFamily: el.fontFamily ?? "inherit", color: el.kind === "title" ? "var(--c-text-primary)" : "var(--c-text-muted)", textAlign: el.align ?? "left", justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start" }}>
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

  return (
    <div className="rounded px-2 py-2" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
      <label className="flex items-center gap-2 text-[11px]" style={{ color: enabled ? "var(--c-accent-violet)" : "var(--c-text-muted)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { fieldId: sourceFields[0]?.fieldId ?? "", operator: "equals", value: "" } : undefined)}
        />
        Mostrar solo si…
      </label>
      {enabled && (
        sourceFields.length === 0 ? (
          <p className="mt-1.5 text-[10px]" style={{ color: "var(--c-text-placeholder)" }}>
            Agregá otro campo al lienzo para usarlo como condición.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              value={showWhen!.fieldId}
              onChange={(e) => onChange({ ...showWhen!, fieldId: e.target.value })}
              className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              {sourceFields.map((s) => <option key={s.fieldId} value={s.fieldId}>{s.label}</option>)}
            </select>
            <select
              value={showWhen!.operator}
              onChange={(e) => onChange({ ...showWhen!, operator: e.target.value as ConditionOperator })}
              className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {needsValue && (() => {
              // Si el campo fuente es un select con opciones, ofrecemos un dropdown.
              const opts = srcField?.type === "select" && !srcField.source ? (srcField.options ?? []) : null;
              return opts ? (
                <select
                  value={showWhen!.value ?? ""}
                  onChange={(e) => onChange({ ...showWhen!, value: e.target.value })}
                  className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                  style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                >
                  <option value="">— Valor —</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  value={showWhen!.value ?? ""}
                  onChange={(e) => onChange({ ...showWhen!, value: e.target.value })}
                  placeholder="Valor…"
                  className="w-full rounded px-1.5 py-1 text-[11px] outline-none"
                  style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
                />
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
    // Línea fina centrada vertical (el alto del elemento es solo el área de agarre).
    return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}><div style={{ width: "100%", height: 2, background: "var(--c-border)" }} /></div>;
  }
  if (el.kind === "section") {
    return (
      <div style={{ width: "100%", height: "100%", borderRadius: 8, border: "1px solid rgb(var(--c-accent-violet-rgb) / 0.3)", background: "rgb(var(--c-accent-violet-rgb) / 0.04)", padding: "4px 8px" }}>
        <span className="font-mono text-[10px] uppercase" style={{ color: "var(--c-accent-violet)" }}>{el.text || "Sección"}</span>
      </div>
    );
  }
  if (el.kind === "image") {
    return el.src
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--c-bg-elevated)", color: "var(--c-text-muted)", fontSize: 10 }}>Imagen (URL)</div>;
  }
  if (el.kind === "title" || el.kind === "text") {
    const vAlignItems = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: vAlignItems, padding: "2px 6px", fontSize: el.fontSize ?? (el.kind === "title" ? 22 : 13), fontWeight: el.kind === "title" ? 700 : 400, fontFamily: el.fontFamily ?? "inherit", color: el.kind === "title" ? "var(--c-text-primary)" : "var(--c-text-muted)", textAlign: el.align ?? "left", justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start", overflow: "hidden" }}>
        {el.text || (el.kind === "title" ? "Título" : "Texto")}
      </div>
    );
  }
  // field
  return (
    <div style={{ width: "100%", height: "100%", padding: 6, background: "var(--c-bg-elevated)", display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--c-text-secondary)" }}>
        {field?.label ?? "(campo eliminado)"}
        {el.readOnly && <span className="rounded px-1 font-mono text-[7px] uppercase" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.15)", color: "var(--c-accent-amber)" }}>solo lec.</span>}
      </span>
      <div className="flex-1 rounded" style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", minHeight: 8 }} />
    </div>
  );
}
