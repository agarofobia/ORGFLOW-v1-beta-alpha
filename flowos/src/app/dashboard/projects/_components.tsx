// Componentes presentacionales hoja del módulo de Proyectos.
// Extraídos de page.tsx (puro display, sin estado propio acoplado a la página).

import type { Employee } from "./_shared";

// ─── Avatar (lookup by employee id preferido, fallback a nombre) ───────────────
// Buscar por id primero — sobrevive a renombres del empleado y es la correlación real.
export function EmployeeAvatar({ name, employeeId, employees, size = 22 }: {
  name?: string | null; employeeId?: string | null; employees: Employee[]; size?: number;
}) {
  const emp = employeeId ? employees.find(e => e.id === employeeId) : (name ? employees.find(e => e.fullName === name) : null);
  const displayName = emp?.fullName ?? name ?? "";
  if (!displayName) return null;
  const color = emp?.color ?? "var(--c-text-muted)";
  const initials = displayName.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div title={emp ? `${displayName}${emp.jobTitle ? " — " + emp.jobTitle : ""}` : displayName}
      style={{
        width: size, height: size, borderRadius: "50%", background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.42, fontWeight: 700, color: "#fff",
        flexShrink: 0, boxShadow: `0 0 0 1.5px ${color}33`,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Stat (label + número) ─────────────────────────────────────────────────────
export function Stat({ label, value, color = "var(--c-accent-blue)" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 9, color: "var(--c-text-muted)", fontFamily: "monospace", textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

// ─── QuickChip (toggle chip de filtro/vista) ───────────────────────────────────
export function QuickChip({ label, active, color, onClick, disabled }: {
  label: string; active: boolean; color: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      fontSize: 11, padding: "4px 10px", borderRadius: 4,
      background: active ? `${color}22` : "transparent",
      border: `1px solid ${active ? color + "66" : "var(--c-border)"}`,
      color: active ? color : "var(--c-text-muted)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em",
    }}
      title={disabled ? "Pronto" : undefined}>
      {label}
    </button>
  );
}
