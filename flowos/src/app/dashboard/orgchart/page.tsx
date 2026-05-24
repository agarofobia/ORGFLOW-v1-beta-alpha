import { OrgChartCanvas } from "@/components/dashboard/orgchart-canvas";

export default function OrgChartPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <header
        className="flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-base)", padding: "14px 24px", flexShrink: 0 }}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)", margin: 0 }}>
            Módulo
          </p>
          <h1 style={{ color: "var(--c-text-primary)", fontSize: 18, fontWeight: 700, margin: "2px 0 0", lineHeight: 1.2 }}>
            Organigrama
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--c-text-muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--c-accent-emerald)", display: "inline-block" }} />
          Cambios guardados
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <OrgChartCanvas />
      </div>
    </div>
  );
}
