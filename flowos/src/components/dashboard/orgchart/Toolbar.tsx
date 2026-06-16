"use client";

// Barra de herramientas flotante del orgchart (estilo Excalidraw/tldraw). Presentacional:
// recibe estado + callbacks por props. Extraído de orgchart-canvas.tsx.
import { Search, Sparkles, Loader2, Download, Layers, FolderPlus, UserPlus } from "lucide-react";

export function OrgChartToolbar({
  searchOpen, onToggleSearch,
  autoLayoutPending, onAutoLayout,
  exportingPng, onExport,
  onNewDivision, onNewDepartment, onNewPosition,
  globalConnectable, setGlobalConnectable,
  linkedResize, setLinkedResize,
  showRoleBadges, setShowRoleBadges,
  locked, setLocked,
  canUndo, onUndo, canRedo, onRedo,
}: {
  searchOpen: boolean; onToggleSearch: () => void;
  autoLayoutPending: boolean; onAutoLayout: () => void;
  exportingPng: boolean; onExport: () => void;
  onNewDivision: () => void; onNewDepartment: () => void; onNewPosition: () => void;
  globalConnectable: boolean; setGlobalConnectable: (v: boolean) => void;
  linkedResize: boolean; setLinkedResize: (v: boolean) => void;
  showRoleBadges: boolean; setShowRoleBadges: (v: boolean) => void;
  locked: boolean; setLocked: (v: boolean) => void;
  canUndo: boolean; onUndo: () => void; canRedo: boolean; onRedo: () => void;
}) {
  const toggles: { on: boolean; setter: (v: boolean) => void; key: string; color: string; label: string; icon: string }[] = [
    { on: globalConnectable, setter: setGlobalConnectable, key: "global-connectable", color: "var(--c-accent-emerald)", label: "Conectables", icon: "🔗" },
    { on: linkedResize, setter: setLinkedResize, key: "linked-resize", color: "var(--c-accent-violet)", label: "Tamaño vinculado", icon: "📐" },
    { on: showRoleBadges, setter: setShowRoleBadges, key: "show-badges", color: "var(--c-accent-amber)", label: "Badges DIR/ENC", icon: "🏷️" },
    { on: !locked, setter: (v: boolean) => setLocked(!v), key: "locked", color: "var(--c-accent-blue)", label: locked ? "Bloqueado" : "Editable", icon: locked ? "🔒" : "🔓" },
  ];

  return (
    <div
      className="flex items-center gap-0.5"
      style={{
        background: "rgba(14,18,32,0.95)",
        border: "1px solid var(--c-border)",
        borderRadius: 10,
        padding: "6px 8px",
        backdropFilter: "blur(10px)",
        boxShadow: "0 6px 24px var(--c-shadow-strong)",
      }}
    >
      {/* Vista / utilidades */}
      <button
        onClick={onToggleSearch}
        title="Buscar (Ctrl+F)"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-border)]"
        style={{
          background: searchOpen ? "rgb(var(--c-accent-blue-rgb) / 0.18)" : "transparent",
          color: searchOpen ? "var(--c-accent-blue)" : "var(--c-text-secondary)",
        }}
      >
        <Search className="h-4 w-4" />
      </button>
      <button
        onClick={onAutoLayout}
        disabled={autoLayoutPending}
        title="Auto-layout (dagre)"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-border)]"
        style={{ color: "var(--c-accent-violet)", opacity: autoLayoutPending ? 0.6 : 1 }}
      >
        {autoLayoutPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      </button>
      <button
        onClick={onExport}
        disabled={exportingPng}
        title="Exportar PNG"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-border)]"
        style={{ color: "var(--c-accent-emerald)", opacity: exportingPng ? 0.6 : 1 }}
      >
        {exportingPng ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>

      <div style={{ width: 1, height: 22, background: "var(--c-border)", margin: "0 6px" }} />

      {/* Crear */}
      <button
        onClick={onNewDivision}
        title="Nueva división"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[rgb(var(--c-accent-blue-rgb) / 0.15)]"
        style={{ color: "var(--c-accent-blue)" }}
      >
        <Layers className="h-4 w-4" />
      </button>
      <button
        onClick={onNewDepartment}
        title="Nuevo departamento"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[rgba(200,144,44,0.15)]"
        style={{ color: "#C8902C" }}
      >
        <FolderPlus className="h-4 w-4" />
      </button>
      <button
        onClick={onNewPosition}
        title="Nuevo puesto"
        className="flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white transition-all hover:brightness-110"
        style={{ background: "var(--c-accent-blue)", boxShadow: "0 0 12px rgb(var(--c-accent-blue-rgb) / 0.35)", marginLeft: 2 }}
      >
        <UserPlus className="h-4 w-4" />
        Puesto
      </button>

      <div style={{ width: 1, height: 22, background: "var(--c-border)", margin: "0 6px" }} />

      {/* Toggles compactos — icono + mini switch */}
      {toggles.map(t => (
        <button
          key={t.key}
          onClick={() => t.setter(!t.on)}
          title={`${t.label}: ${t.on ? "ON" : "OFF"}`}
          className="flex h-9 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-[var(--c-border)]"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          <span style={{ fontSize: 13, opacity: t.on ? 1 : 0.5, filter: t.on ? "none" : "grayscale(1)" }}>{t.icon}</span>
          {/* iOS-style switch chico */}
          <span
            style={{
              position: "relative",
              width: 22, height: 12,
              background: t.on ? t.color : "#2A3450",
              borderRadius: 999,
              transition: "background 160ms ease",
              flexShrink: 0,
              boxShadow: t.on ? `0 0 5px ${t.color}55` : "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2, left: t.on ? 12 : 2,
                width: 8, height: 8,
                background: "#fff",
                borderRadius: "50%",
                transition: "left 160ms ease",
                boxShadow: "0 1px 2px var(--c-shadow-soft)",
              }}
            />
          </span>
        </button>
      ))}

      <div style={{ width: 1, height: 22, background: "var(--c-border)", margin: "0 6px" }} />

      {/* Historia */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Deshacer (Ctrl+Z)"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-border)]"
        style={{
          color: !canUndo ? "var(--c-text-placeholder)" : "var(--c-text-secondary)",
          cursor: !canUndo ? "not-allowed" : "pointer",
          fontSize: 16,
        }}
      >
        ↶
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Rehacer (Ctrl+Shift+Z)"
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-border)]"
        style={{
          color: !canRedo ? "var(--c-text-placeholder)" : "var(--c-text-secondary)",
          cursor: !canRedo ? "not-allowed" : "pointer",
          fontSize: 16,
        }}
      >
        ↷
      </button>
    </div>
  );
}
