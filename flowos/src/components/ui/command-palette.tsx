"use client";

// Ctrl+K / Cmd+K command palette para navegación rápida.
// Se monta en el dashboard layout. Escucha el shortcut a nivel ventana.
// Comandos iniciales: navegación + acciones básicas.

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ArrowRight,
  Sun, Inbox, CheckSquare, LayoutGrid,
  Workflow, FileText, GitBranch, UserCircle2, Activity, Users, Settings,
  Plus, type LucideIcon,
} from "lucide-react";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  // Una de las dos: navegar a URL o ejecutar acción.
  href?: string;
  action?: () => void;
  // Para fuzzy search — palabras clave adicionales.
  keywords?: string[];
}

const PAGE_COMMANDS: Command[] = [
  { id: "nav-today", label: "Mi día", hint: "Ir a tu vista personal", icon: Sun, href: "/dashboard/today", keywords: ["hoy", "tareas", "asignadas"] },
  { id: "nav-inbox", label: "Bandeja", hint: "Tareas de procesos BPM", icon: Inbox, href: "/dashboard/inbox", keywords: ["inbox", "bpm"] },
  { id: "nav-projects", label: "Proyectos", hint: "Hub de proyectos", icon: CheckSquare, href: "/dashboard/projects" },
  { id: "nav-home", label: "Inicio", hint: "Dashboard general", icon: LayoutGrid, href: "/dashboard", keywords: ["overview", "metricas"] },
  { id: "nav-processes", label: "Procesos", hint: "Diseñá flujos BPM", icon: Workflow, href: "/dashboard/processes", keywords: ["bpm", "flujos"] },
  { id: "nav-docs", label: "Docs", hint: "Documentos del equipo", icon: FileText, href: "/dashboard/docs", keywords: ["archivos", "knowledge"] },
  { id: "nav-orgchart", label: "Organigrama", hint: "Estructura de la org", icon: GitBranch, href: "/dashboard/orgchart", keywords: ["org", "chart", "estructura"] },
  { id: "nav-employees", label: "Empleados", hint: "Lista de miembros", icon: UserCircle2, href: "/dashboard/employees", keywords: ["personas", "team"] },
  { id: "nav-workload", label: "Carga", hint: "Carga de trabajo del equipo", icon: Activity, href: "/dashboard/workload", keywords: ["distribución", "tareas"] },
  { id: "nav-team", label: "Equipo", hint: "Miembros y roles (Clerk)", icon: Users, href: "/dashboard/team", keywords: ["roles", "members", "clerk"] },
  { id: "nav-settings", label: "Configuración", hint: "Ajustes del sistema", icon: Settings, href: "/dashboard/settings", keywords: ["preferencias", "tema"] },
];

const ACTION_COMMANDS: Command[] = [
  { id: "act-new-project", label: "Crear proyecto", hint: "Ir al hub y crear nuevo", icon: Plus, href: "/dashboard/projects?action=new", keywords: ["nuevo", "agregar"] },
  { id: "act-new-process", label: "Crear proceso BPM", hint: "Diseñá un flujo nuevo", icon: Plus, href: "/dashboard/processes?action=new", keywords: ["nuevo", "bpm"] },
  { id: "act-new-employee", label: "Crear empleado", hint: "Agregá un puesto al orgchart", icon: Plus, href: "/dashboard/employees?action=new", keywords: ["nuevo", "puesto"] },
];

const ALL_COMMANDS: Command[] = [...PAGE_COMMANDS, ...ACTION_COMMANDS];

// Fuzzy filter — match si query está en label O en keywords (case insensitive).
function filterCommands(query: string): Command[] {
  if (!query.trim()) return ALL_COMMANDS;
  const q = query.toLowerCase();
  return ALL_COMMANDS.filter(c => {
    const haystack = [c.label, c.hint ?? "", ...(c.keywords ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => filterCommands(query), [query]);

  // Reset activeIdx cuando cambia el filtro
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Foco al input cuando abre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  // Shortcut global Ctrl+K / Cmd+K para abrir/cerrar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const execCommand = useCallback((cmd: Command) => {
    setOpen(false);
    if (cmd.href) router.push(cmd.href);
    else if (cmd.action) cmd.action();
  }, [router]);

  // Navegación con flechas + Enter
  const onKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) execCommand(cmd);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDownList}
        style={{
          width: "100%", maxWidth: 560,
          background: "#0E1220",
          border: "1px solid #1E2540",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid #1E2540",
        }}>
          <Search style={{ width: 16, height: 16, color: "#7A8BAD" }} strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar páginas, acciones…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#E2E8F8", fontSize: 14, fontFamily: "inherit",
            }}
          />
          <span style={{
            fontSize: 10, fontFamily: "monospace",
            color: "#7A8BAD", background: "#141928",
            padding: "2px 6px", borderRadius: 4,
            border: "1px solid #1E2540",
          }}>
            ESC
          </span>
        </div>

        {/* Resultados */}
        <div style={{ maxHeight: "55vh", overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 ? (
            <p style={{ padding: "24px 16px", textAlign: "center", color: "#7A8BAD", fontSize: 13 }}>
              Sin resultados para &quot;{query}&quot;
            </p>
          ) : (
            filtered.map((cmd, i) => {
              const active = i === activeIdx;
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={() => execCommand(cmd)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: 6,
                    background: active ? "#141928" : "transparent",
                    border: "none", color: "#E2E8F8",
                    cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: active ? "rgba(61,126,255,0.18)" : "#141928",
                    border: active ? "1px solid rgba(61,126,255,0.4)" : "1px solid #1E2540",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon style={{ width: 14, height: 14, color: active ? "#3D7EFF" : "#7A8BAD" }} strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#E2E8F8" }}>{cmd.label}</p>
                    {cmd.hint && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7A8BAD" }}>{cmd.hint}</p>
                    )}
                  </div>
                  {active && <ArrowRight style={{ width: 14, height: 14, color: "#3D7EFF" }} />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 16px", borderTop: "1px solid #1E2540",
          fontSize: 10, fontFamily: "monospace", color: "#7A8BAD",
        }}>
          <span>↑↓ navegar · ⏎ ejecutar</span>
          <span>Ctrl+K abrir/cerrar</span>
        </div>
      </div>
    </div>
  );
}
