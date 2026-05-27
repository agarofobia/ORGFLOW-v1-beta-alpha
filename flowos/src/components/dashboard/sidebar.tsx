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
import { useMobileNav } from "./mobile-nav-context";

// Sidebar reordenado por frecuencia de uso del día a día.
// Bloque 1: lo que abrís cada mañana. Bloque 2: operativa. Bloque 3: estructura/gestión.

const NAV_GROUPS = [
  {
    label: "Día a día",
    items: [
      { href: "/dashboard", label: "Inicio", icon: LayoutGrid },
      { href: "/dashboard/inbox", label: "Bandeja", icon: Inbox },
      { href: "/dashboard/today", label: "Mi día", icon: Sun },
      { href: "/dashboard/projects", label: "Proyectos", icon: CheckSquare },
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
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();

  return (
    <>
      {/* Backdrop overlay para mobile — visible solo cuando sidebar está abierto */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "var(--c-shadow-strong)" }}
        />
      )}
      <aside
        className={cn(
          "flex h-screen w-[185px] flex-col flex-shrink-0",
          // Desktop: estático en el flow.
          // Mobile: fixed overlay con slide-in. Translate-x oculta cuando cerrado.
          "md:static md:translate-x-0 md:z-auto",
          "fixed left-0 top-0 z-40 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        style={{ background: "var(--c-bg-base)", borderRight: "1px solid var(--c-border)" }}
      >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: "var(--c-accent-blue)" }}
        >
          <Zap className="h-4 w-4 text-white" strokeWidth={2.5} fill="white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none" style={{ color: "var(--c-text-primary)" }}>
            FlowOS
          </p>
          <p
            className="mt-0.5 font-mono text-[9px] uppercase tracking-widest leading-none"
            style={{ color: "var(--c-text-muted)" }}
          >
            BPM Suite
          </p>
        </div>
      </div>

      <div style={{ height: "1px", background: "var(--c-border)" }} />

      {/* Nav principal — agrupado por frecuencia de uso */}
      <nav className="flex-1 overflow-y-auto px-2 pt-3 pb-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : 14 }}>
            <p
              className="mb-1.5 px-3 font-mono text-[9px] font-medium uppercase tracking-widest"
              style={{ color: "var(--c-text-muted)" }}
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
                          : "hover:bg-[var(--c-bg-elevated)]"
                      )}
                      style={
                        active
                          ? {
                              background: "rgb(var(--c-accent-blue-rgb) / 0.12)",
                              borderLeft: "2px solid var(--c-accent-blue)",
                              color: "var(--c-text-primary)",
                              paddingLeft: "10px",
                            }
                          : { color: "var(--c-text-muted)" }
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
                          style={{ color: "var(--c-accent-blue)" }}
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

        <div style={{ height: "1px", background: "var(--c-border)", margin: "14px 0 10px" }} />

        <p
          className="mb-1.5 px-3 font-mono text-[9px] font-medium uppercase tracking-widest"
          style={{ color: "var(--c-text-muted)" }}
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
                    active ? "font-medium" : "hover:bg-[var(--c-bg-elevated)]"
                  )}
                  style={
                    active
                      ? {
                          background: "rgb(var(--c-accent-blue-rgb) / 0.12)",
                          borderLeft: "2px solid var(--c-accent-blue)",
                          color: "var(--c-text-primary)",
                          paddingLeft: "10px",
                        }
                      : { color: "var(--c-text-muted)" }
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                    {item.label}
                  </span>
                  {active && (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--c-accent-blue)" }}
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
      <div style={{ borderTop: "1px solid var(--c-border)" }}>
        {/* Org switcher */}
        <div className="px-3 py-3">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
            appearance={{
              variables: {
                colorPrimary: "var(--c-accent-blue)",
                colorBackground: "var(--c-bg-elevated)",
                colorText: "var(--c-text-primary)",
                colorTextSecondary: "var(--c-text-muted)",
                colorInputBackground: "var(--c-bg-overlay)",
                colorNeutral: "var(--c-text-muted)",
                borderRadius: "0.375rem",
              },
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--c-bg-elevated)] transition-colors",
                organizationSwitcherTriggerIcon: "text-[var(--c-text-muted)]",
              },
            }}
          />
        </div>

        {/* User */}
        <div
          className="flex items-center gap-2.5 px-3 pb-4"
          style={{ borderTop: "1px solid var(--c-border)", paddingTop: "10px" }}
        >
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium leading-none" style={{ color: "var(--c-text-primary)" }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-none" style={{ color: "var(--c-text-muted)" }}>
              Admin
            </p>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
