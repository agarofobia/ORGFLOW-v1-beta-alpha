"use client";

import { usePathname } from "next/navigation";

const SECTION_LABELS: Record<string, string> = {
  "/dashboard": "inicio",
  "/dashboard/orgchart": "organigrama",
  "/dashboard/projects": "proyectos",
  "/dashboard/processes": "procesos",
  "/dashboard/inbox": "bandeja",
  "/dashboard/employees": "empleados",
  "/dashboard/docs": "documentos",
  "/dashboard/workload": "carga de trabajo",
  "/dashboard/settings": "configuración",
  "/dashboard/billing": "facturación",
  "/dashboard/team": "equipo",
  "/dashboard/today": "hoy",
};

export function DashboardStatusbar() {
  const pathname = usePathname();

  const sectionKey = Object.keys(SECTION_LABELS)
    .filter((k) => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  const section = sectionKey ? SECTION_LABELS[sectionKey] : "dashboard";

  return (
    <div
      style={{
        background: "var(--c-accent-blue)",
        color: "var(--c-accent-fg, #063a30)",
        fontFamily: "var(--font-dm-mono, monospace)",
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        height: 24,
        letterSpacing: "0.02em",
        flexShrink: 0,
        userSelect: "none",
        position: "relative",
        zIndex: 50,
      }}
    >
      <span style={{ opacity: 0.85, fontWeight: 600 }}>⌬ FlowOS</span>
      <span style={{ margin: "0 8px", opacity: 0.5 }}>/</span>
      <span style={{ opacity: 0.75 }}>{section}</span>
      <span style={{ flex: 1 }} />
      <span style={{ opacity: 0.6 }}>
        <kbd style={{ fontFamily: "inherit", opacity: 0.9 }}>Ctrl+K</kbd>
        {" "}buscar
      </span>
    </div>
  );
}
