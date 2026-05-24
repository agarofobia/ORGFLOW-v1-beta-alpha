"use client";

// Ctrl+K / Cmd+K command palette — ahora con búsqueda global real.
// Cuando el query tiene ≥2 chars, además de las navegaciones, hace fetch a
// /api/search?q=... y muestra resultados de proyectos / tareas / empleados /
// hitos / procesos / documentos.

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ArrowRight, Loader2,
  Sun, Inbox, CheckSquare, LayoutGrid,
  Workflow, FileText, GitBranch, UserCircle2, Activity, Users, Settings,
  Plus, Folder, ListTodo, Flag, FileBadge,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BaseCommand {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  action?: () => void;
  keywords?: string[];
  badge?: string; // pequeña etiqueta a la derecha ("Proyecto", "Hito", etc.)
  badgeColor?: string;
}

interface SearchHitRaw {
  type: "project" | "task" | "employee" | "milestone" | "process" | "document";
  id: string;
  label: string;
  hint?: string;
  href: string;
}

const PAGE_COMMANDS: BaseCommand[] = [
  { id: "nav-home", label: "Inicio", hint: "Dashboard general", icon: LayoutGrid, href: "/dashboard", keywords: ["overview", "metricas"] },
  { id: "nav-inbox", label: "Bandeja", hint: "Tareas de procesos BPM", icon: Inbox, href: "/dashboard/inbox", keywords: ["inbox", "bpm"] },
  { id: "nav-today", label: "Mi día", hint: "Ir a tu vista personal", icon: Sun, href: "/dashboard/today", keywords: ["hoy", "tareas", "asignadas"] },
  { id: "nav-projects", label: "Proyectos", hint: "Hub de proyectos", icon: CheckSquare, href: "/dashboard/projects" },
  { id: "nav-processes", label: "Procesos", hint: "Diseñá flujos BPM", icon: Workflow, href: "/dashboard/processes", keywords: ["bpm", "flujos"] },
  { id: "nav-docs", label: "Docs", hint: "Documentos del equipo", icon: FileText, href: "/dashboard/docs", keywords: ["archivos", "knowledge"] },
  { id: "nav-orgchart", label: "Organigrama", hint: "Estructura de la org", icon: GitBranch, href: "/dashboard/orgchart", keywords: ["org", "chart", "estructura"] },
  { id: "nav-employees", label: "Empleados", hint: "Lista de miembros", icon: UserCircle2, href: "/dashboard/employees", keywords: ["personas", "team"] },
  { id: "nav-workload", label: "Carga", hint: "Carga de trabajo del equipo", icon: Activity, href: "/dashboard/workload", keywords: ["distribución", "tareas"] },
  { id: "nav-team", label: "Equipo", hint: "Miembros y roles", icon: Users, href: "/dashboard/team", keywords: ["roles", "members", "clerk"] },
  { id: "nav-settings", label: "Configuración", hint: "Ajustes del sistema", icon: Settings, href: "/dashboard/settings", keywords: ["preferencias", "tema"] },
];

const ACTION_COMMANDS: BaseCommand[] = [
  { id: "act-new-project", label: "Crear proyecto", hint: "Ir al hub y crear nuevo", icon: Plus, href: "/dashboard/projects?action=new", keywords: ["nuevo", "agregar"] },
  { id: "act-new-process", label: "Crear proceso BPM", hint: "Diseñá un flujo nuevo", icon: Plus, href: "/dashboard/processes?action=new", keywords: ["nuevo", "bpm"] },
  { id: "act-new-employee", label: "Crear empleado", hint: "Agregá un puesto al orgchart", icon: Plus, href: "/dashboard/employees?action=new", keywords: ["nuevo", "puesto"] },
];

const ALL_NAV_COMMANDS = [...PAGE_COMMANDS, ...ACTION_COMMANDS];

// Mapping de tipo de hit a icon + color de badge
const HIT_META: Record<SearchHitRaw["type"], { icon: LucideIcon; badge: string; color: string }> = {
  project:   { icon: Folder,       badge: "Proyecto",  color: "var(--c-accent-blue)" },
  task:      { icon: ListTodo,     badge: "Tarea",     color: "var(--c-accent-amber)" },
  employee:  { icon: UserCircle2,  badge: "Empleado",  color: "var(--c-accent-emerald)" },
  milestone: { icon: Flag,         badge: "Hito",      color: "var(--c-accent-violet)" },
  process:   { icon: Workflow,     badge: "Proceso",   color: "var(--c-accent-cyan)" },
  document:  { icon: FileBadge,    badge: "Documento", color: "var(--c-accent-pink)" },
};

// ─── Filter helpers ──────────────────────────────────────────────────────────

function filterNavCommands(query: string): BaseCommand[] {
  if (!query.trim()) return ALL_NAV_COMMANDS;
  const q = query.toLowerCase();
  return ALL_NAV_COMMANDS.filter((c) => {
    const haystack = [c.label, c.hint ?? "", ...(c.keywords ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function hitToCommand(hit: SearchHitRaw): BaseCommand {
  const meta = HIT_META[hit.type];
  return {
    id: `hit-${hit.type}-${hit.id}`,
    label: hit.label,
    hint: hit.hint,
    icon: meta.icon,
    href: hit.href,
    badge: meta.badge,
    badgeColor: meta.color,
  };
}

// ─── Hook con debounce para fetch search ─────────────────────────────────────

function useSearch(query: string) {
  const [results, setResults] = useState<BaseCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myId = ++reqId.current;
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (!r.ok) throw new Error("fail");
        const data = await r.json();
        if (reqId.current !== myId) return; // request más reciente ya está en vuelo
        const cmds = Array.isArray(data.hits) ? (data.hits as SearchHitRaw[]).map(hitToCommand) : [];
        setResults(cmds);
      } catch {
        if (reqId.current === myId) setResults([]);
      } finally {
        if (reqId.current === myId) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(handle);
  }, [query]);

  return { results, loading };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const navMatches = useMemo(() => filterNavCommands(query), [query]);
  const { results: searchHits, loading } = useSearch(query);

  // Combinar: navegación primero, después hits de DB
  const allMatches = useMemo(() => [...navMatches, ...searchHits], [navMatches, searchHits]);

  useEffect(() => { setActiveIdx(0); }, [query, allMatches.length]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const execCommand = useCallback(
    (cmd: BaseCommand) => {
      setOpen(false);
      if (cmd.href) router.push(cmd.href);
      else if (cmd.action) cmd.action();
    },
    [router]
  );

  const onKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(allMatches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = allMatches[activeIdx];
      if (cmd) execCommand(cmd);
    }
  };

  if (!open) return null;

  const hasQuery = query.trim().length >= 2;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDownList}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "var(--c-bg-surface)",
          border: "1px solid var(--c-border)",
          borderRadius: 12,
          boxShadow: "0 24px 60px var(--c-shadow-strong)",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--c-border)",
          }}
        >
          {loading ? (
            <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: "var(--c-accent-blue)" }} />
          ) : (
            <Search style={{ width: 16, height: 16, color: "var(--c-text-muted)" }} strokeWidth={1.75} />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar páginas, proyectos, tareas, empleados…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--c-text-primary)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "var(--c-text-muted)",
              background: "var(--c-bg-elevated)",
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid var(--c-border)",
            }}
          >
            ESC
          </span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "55vh", overflowY: "auto", padding: 6 }}>
          {allMatches.length === 0 ? (
            <p style={{ padding: "24px 16px", textAlign: "center", color: "var(--c-text-muted)", fontSize: 13 }}>
              {hasQuery
                ? `Sin resultados para "${query}"`
                : "Escribí para buscar páginas, proyectos, tareas o personas…"}
            </p>
          ) : (
            <>
              {navMatches.length > 0 && (
                <p
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "var(--c-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Navegación
                </p>
              )}
              {navMatches.map((cmd, i) => renderRow(cmd, i, activeIdx, setActiveIdx, execCommand))}

              {searchHits.length > 0 && (
                <p
                  style={{
                    padding: "12px 12px 4px",
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "var(--c-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  En tu organización
                </p>
              )}
              {searchHits.map((cmd, i) =>
                renderRow(cmd, navMatches.length + i, activeIdx, setActiveIdx, execCommand)
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderTop: "1px solid var(--c-border)",
            fontSize: 10,
            fontFamily: "monospace",
            color: "var(--c-text-muted)",
          }}
        >
          <span>↑↓ navegar · ⏎ ejecutar</span>
          <span>Ctrl+K abrir/cerrar</span>
        </div>
      </div>
    </div>
  );
}

// ─── Render helper ───────────────────────────────────────────────────────────

function renderRow(
  cmd: BaseCommand,
  i: number,
  activeIdx: number,
  setActiveIdx: (n: number) => void,
  execCommand: (cmd: BaseCommand) => void
) {
  const active = i === activeIdx;
  const Icon = cmd.icon;
  return (
    <button
      key={cmd.id}
      onClick={() => execCommand(cmd)}
      onMouseEnter={() => setActiveIdx(i)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 6,
        background: active ? "var(--c-bg-elevated)" : "transparent",
        border: "none",
        color: "var(--c-text-primary)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: active
            ? `rgb(var(--c-accent-blue-rgb) / 0.18)`
            : "var(--c-bg-elevated)",
          border: active
            ? "1px solid rgb(var(--c-accent-blue-rgb) / 0.4)"
            : "1px solid var(--c-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon
          style={{
            width: 14,
            height: 14,
            color: active ? "var(--c-accent-blue)" : cmd.badgeColor ?? "var(--c-text-muted)",
          }}
          strokeWidth={1.75}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--c-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {cmd.label}
        </p>
        {cmd.hint && (
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 11,
              color: "var(--c-text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cmd.hint}
          </p>
        )}
      </div>
      {cmd.badge && (
        <span
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: cmd.badgeColor ?? "var(--c-text-muted)",
            background: cmd.badgeColor
              ? `${cmd.badgeColor}1a`
              : "var(--c-bg-elevated)",
            border: `1px solid ${cmd.badgeColor ? `${cmd.badgeColor}33` : "var(--c-border)"}`,
            padding: "1px 6px",
            borderRadius: 4,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          {cmd.badge}
        </span>
      )}
      {active && (
        <ArrowRight style={{ width: 14, height: 14, color: "var(--c-accent-blue)", flexShrink: 0 }} />
      )}
    </button>
  );
}
