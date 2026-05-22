"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  GitBranch,
  Users,
  Settings,
  FileText,
  CheckSquare,
  UserCircle2,
  ChevronRight,
  Zap,
  Workflow,
  Inbox,
  Activity,
  Sun,
} from "lucide-react";
import { OrganizationSwitcher, UserButton, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

// Sidebar reordenado por frecuencia de uso del día a día.
// Bloque 1: lo que abrís cada mañana. Bloque 2: operativa. Bloque 3: estructura/gestión.

const NAV_GROUPS = [
  {
    label: "Día a día",
    items: [
      { href: "/dashboard/today", label: "Mi día", icon: Sun },
      { href: "/dashboard/inbox", label: "Bandeja", icon: Inbox },
      { href: "/dashboard/projects", label: "Proyectos", icon: CheckSquare },
      { href: "/dashboard", label: "Inicio", icon: LayoutGrid },
    ],
  },
  {
    label: "Operativa",
    items: [
      { href: "/dashboard/processes", label: "Procesos", icon: Workflow },
      { href: "/dashboard/docs", label: "Docs", icon: FileText },
    ],
  },
  {
    label: "Estructura",
    items: [
      { href: "/dashboard/orgchart", label: "Organigrama", icon: GitBranch },
      { href: "/dashboard/employees", label: "Empleados", icon: UserCircle2 },
      { href: "/dashboard/workload", label: "Carga", icon: Activity },
      { href: "/dashboard/team", label: "Equipo", icon: Users },
    ],
  },
];

const FOOTER_NAV = [
  { href: "/dashboard/settings", label: "Configuración", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  return (
    <aside
      className="flex h-screen w-[185px] flex-col flex-shrink-0"
      style={{ background: "#080B12", borderRight: "1px solid #1E2540" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: "#3D7EFF" }}
        >
          <Zap className="h-4 w-4 text-white" strokeWidth={2.5} fill="white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none" style={{ color: "#E2E8F8" }}>
            FlowOS
          </p>
          <p
            className="mt-0.5 font-mono text-[9px] uppercase tracking-widest leading-none"
            style={{ color: "#7A8BAD" }}
          >
            BPM Suite
          </p>
        </div>
      </div>

      <div style={{ height: "1px", background: "#1E2540" }} />

      {/* Nav principal — agrupado por frecuencia de uso */}
      <nav className="flex-1 overflow-y-auto px-2 pt-3 pb-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : 14 }}>
            <p
              className="mb-1.5 px-3 font-mono text-[9px] font-medium uppercase tracking-widest"
              style={{ color: "#7A8BAD" }}
            >
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center justify-between rounded px-3 py-2 text-sm transition-all duration-150",
                        active
                          ? "font-medium"
                          : "hover:bg-[#141928]"
                      )}
                      style={
                        active
                          ? {
                              background: "rgba(61,126,255,0.12)",
                              borderLeft: "2px solid #3D7EFF",
                              color: "#E2E8F8",
                              paddingLeft: "10px",
                            }
                          : { color: "#7A8BAD" }
                      }
                    >
                      <span className="flex items-center gap-2.5">
                        <item.icon
                          className="h-4 w-4 shrink-0"
                          strokeWidth={active ? 2 : 1.75}
                        />
                        {item.label}
                      </span>
                      {active && (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: "#3D7EFF" }}
                          strokeWidth={2}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div style={{ height: "1px", background: "#1E2540", margin: "14px 0 10px" }} />

        <p
          className="mb-1.5 px-3 font-mono text-[9px] font-medium uppercase tracking-widest"
          style={{ color: "#7A8BAD" }}
        >
          System
        </p>
        <ul className="flex flex-col gap-0.5">
          {FOOTER_NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center justify-between rounded px-3 py-2 text-sm transition-all duration-150",
                    active ? "font-medium" : "hover:bg-[#141928]"
                  )}
                  style={
                    active
                      ? {
                          background: "rgba(61,126,255,0.12)",
                          borderLeft: "2px solid #3D7EFF",
                          color: "#E2E8F8",
                          paddingLeft: "10px",
                        }
                      : { color: "#7A8BAD" }
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                    {item.label}
                  </span>
                  {active && (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "#3D7EFF" }}
                      strokeWidth={2}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom: org + usuario */}
      <div style={{ borderTop: "1px solid #1E2540" }}>
        {/* Org switcher */}
        <div className="px-3 py-3">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
            appearance={{
              variables: {
                colorPrimary: "#3D7EFF",
                colorBackground: "#141928",
                colorText: "#E2E8F8",
                colorTextSecondary: "#7A8BAD",
                colorInputBackground: "#1A2035",
                colorNeutral: "#7A8BAD",
                borderRadius: "0.375rem",
              },
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-[#141928] transition-colors",
                organizationSwitcherTriggerIcon: "text-[#7A8BAD]",
              },
            }}
          />
        </div>

        {/* User */}
        <div
          className="flex items-center gap-2.5 px-3 pb-4"
          style={{ borderTop: "1px solid #1E2540", paddingTop: "10px" }}
        >
          <UserButton afterSignOutUrl="/" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium leading-none" style={{ color: "#E2E8F8" }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-none" style={{ color: "#7A8BAD" }}>
              Admin
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
