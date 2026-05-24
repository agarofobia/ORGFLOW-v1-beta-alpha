"use client";

import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, Search, CheckCheck, Menu } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

interface DbNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Inicio", subtitle: "Vista general de tu organización" },
  "/dashboard/today": { title: "Mi día", subtitle: "Lo que tenés que hacer hoy" },
  "/dashboard/inbox": { title: "Bandeja", subtitle: "Tareas pendientes de procesos BPM" },
  "/dashboard/orgchart": { title: "Organigrama", subtitle: "Visualizá la estructura de tu equipo" },
  "/dashboard/employees": { title: "Empleados", subtitle: "Gestioná los miembros de tu organización" },
  "/dashboard/projects": { title: "Proyectos", subtitle: "Hub de proyectos del equipo" },
  "/dashboard/processes": { title: "Procesos", subtitle: "Diseñá y ejecutá procesos BPM" },
  "/dashboard/workload": { title: "Carga", subtitle: "Distribución de trabajo por persona / departamento" },
  "/dashboard/docs": { title: "Docs", subtitle: "Base de conocimiento del equipo" },
  "/dashboard/team": { title: "Equipo", subtitle: "Miembros y roles de tu organización" },
  "/dashboard/billing": { title: "Billing", subtitle: "Planes y facturación" },
  "/dashboard/settings": { title: "Configuración", subtitle: "Ajustes del sistema" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function DashboardTopbar() {
  const pathname = usePathname();
  const { toggle: toggleMobileNav } = useMobileNav();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.readAt).length;

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (res.ok) setNotifications(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadNotifications();
    // Poll cada 60s — lo más simple. Más adelante: SSE / WebSocket.
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  };

  const markOneRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  };

  const meta =
    PAGE_META[pathname] ??
    Object.entries(PAGE_META).find(([key]) => key !== "/dashboard" && pathname.startsWith(key))?.[1] ??
    { title: "FlowOS", subtitle: "" };

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-6"
      style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-base)" }}
    >
      {/* Hamburger + Título */}
      <div className="flex items-center gap-3">
        {/* Hamburger — visible solo en mobile, abre el sidebar overlay */}
        <button
          onClick={toggleMobileNav}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-bg-elevated)] md:hidden"
          style={{ color: "var(--c-text-muted)" }}
          aria-label="Abrir menú"
        >
          <Menu className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-base font-semibold" style={{ color: "var(--c-text-primary)" }}>
            {meta.title}
          </h1>
          {meta.subtitle && (
            <span className="hidden sm:inline text-sm" style={{ color: "var(--c-text-muted)" }}>
              {meta.subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Acciones derecha */}
      <div className="flex items-center gap-2">
        {/* Search → abre el command palette (Ctrl+K). Click visual + atajo.
            Oculto en mobile (< 640px) para liberar espacio; el palette sigue
            disponible via Ctrl+K o desde el sidebar hamburger. */}
        <button
          onClick={() => {
            // Dispara el shortcut Ctrl+K para abrir el palette (el listener vive en CommandPalette).
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
          }}
          className="hidden sm:flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-[var(--c-bg-elevated)]"
          style={{
            background: "var(--c-bg-surface)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text-muted)",
            minWidth: "200px",
            cursor: "pointer",
          }}
          title="Búsqueda rápida (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-xs flex-1 text-left">Buscar páginas y acciones…</span>
          <span
            className="font-mono text-[9px]"
            style={{
              background: "var(--c-bg-elevated)",
              border: "1px solid var(--c-border)",
              borderRadius: 3,
              padding: "1px 5px",
              color: "var(--c-text-muted)",
            }}
          >
            Ctrl K
          </span>
        </button>

        {/* Notificaciones */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            title={unreadCount > 0 ? `${unreadCount} notificación${unreadCount !== 1 ? "es" : ""} sin leer` : "Notificaciones"}
            aria-label="Notificaciones"
            className="relative flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={{ color: "var(--c-text-muted)" }}
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--c-accent-red)" }}
              />
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 top-10 z-50 w-80 rounded-lg shadow-xl"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <span className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>Notificaciones</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs" style={{ color: "var(--c-accent-blue)" }}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Marcar todo como leído
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--c-text-muted)" }}>
                    No hay notificaciones todavía
                  </p>
                ) : (
                  notifications.map((n) => {
                    const unread = !n.readAt;
                    const content = (
                      <>
                        {unread && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--c-accent-blue)" }} />
                        )}
                        <div className={unread ? "flex-1" : "flex-1 pl-5"}>
                          <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>{n.title}</p>
                          {n.body && <p className="mt-0.5 text-xs" style={{ color: "var(--c-text-muted)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.body}</p>}
                          <p className="mt-1 text-xs" style={{ color: "var(--c-text-dim)" }}>{timeAgo(n.createdAt)}</p>
                        </div>
                      </>
                    );
                    if (n.linkUrl) {
                      return (
                        <Link key={n.id} href={n.linkUrl}
                          onClick={() => { markOneRead(n.id); setNotifOpen(false); }}
                          className="flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-bg-elevated)]"
                          style={{ borderBottom: "1px solid var(--c-border)", textDecoration: "none" }}>
                          {content}
                        </Link>
                      );
                    }
                    return (
                      <div key={n.id}
                        onClick={() => markOneRead(n.id)}
                        className="flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-bg-elevated)] cursor-pointer"
                        style={{ borderBottom: "1px solid var(--c-border)" }}>
                        {content}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
