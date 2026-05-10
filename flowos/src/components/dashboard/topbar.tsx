"use client";

import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Bell, Search, CheckCheck } from "lucide-react";

const MOCK_NOTIFICATIONS = [
  { id: 1, title: "Bienvenido a FlowOS", body: "Tu workspace está listo para usar.", time: "Ahora", unread: true },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Overview of your organization" },
  "/dashboard/orgchart": { title: "Org Chart", subtitle: "Visualizá la estructura de tu equipo" },
  "/dashboard/employees": { title: "Empleados", subtitle: "Gestioná los miembros de tu org" },
  "/dashboard/projects": { title: "Proyectos", subtitle: "Tablero kanban de tareas" },
  "/dashboard/docs": { title: "Docs", subtitle: "Base de conocimiento del equipo" },
  "/dashboard/team": { title: "Equipo", subtitle: "Miembros y roles de tu organización" },
  "/dashboard/billing": { title: "Billing", subtitle: "Planes y facturación" },
  "/dashboard/settings": { title: "Configuración", subtitle: "System configuration" },
};

export function DashboardTopbar() {
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));

  const meta =
    PAGE_META[pathname] ??
    Object.entries(PAGE_META).find(([key]) => key !== "/dashboard" && pathname.startsWith(key))?.[1] ??
    { title: "FlowOS", subtitle: "" };

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-6"
      style={{ borderBottom: "1px solid #1E2540", background: "#080B12" }}
    >
      {/* Título */}
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-base font-semibold" style={{ color: "#E2E8F8" }}>
          {meta.title}
        </h1>
        {meta.subtitle && (
          <span className="text-sm" style={{ color: "#7A8BAD" }}>
            {meta.subtitle}
          </span>
        )}
      </div>

      {/* Acciones derecha */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
          style={{
            background: "#0E1220",
            border: "1px solid #1E2540",
            color: "#7A8BAD",
            minWidth: "180px",
          }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-xs">Search anything…</span>
        </div>

        {/* Notificaciones */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[#141928]"
            style={{ color: "#7A8BAD" }}
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "#F43F5E" }}
              />
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 top-10 z-50 w-80 rounded-lg shadow-xl"
              style={{ background: "#0E1220", border: "1px solid #1E2540" }}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #1E2540" }}>
                <span className="text-sm font-medium" style={{ color: "#E2E8F8" }}>Notificaciones</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs" style={{ color: "#3D7EFF" }}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Marcar todo como leído
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm" style={{ color: "#7A8BAD" }}>
                    No hay notificaciones nuevas
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-[#141928]"
                      style={{ borderBottom: "1px solid #1E2540" }}
                    >
                      {n.unread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#3D7EFF" }} />
                      )}
                      <div className={n.unread ? "" : "pl-5"}>
                        <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>{n.title}</p>
                        <p className="mt-0.5 text-xs" style={{ color: "#7A8BAD" }}>{n.body}</p>
                        <p className="mt-1 text-xs" style={{ color: "#4A5568" }}>{n.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
