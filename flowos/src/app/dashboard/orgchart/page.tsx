import { OrgChartCanvas } from "@/components/dashboard/orgchart-canvas";

export default function OrgChartPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <header
        className="flex items-center justify-between"
        style={{ borderBottom: "1px solid #1E2540", background: "#080B12", padding: "14px 24px", flexShrink: 0 }}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD", margin: 0 }}>
            Módulo
          </p>
          <h1 style={{ color: "#E2E8F8", fontSize: 18, fontWeight: 700, margin: "2px 0 0", lineHeight: 1.2 }}>
            Organigrama
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "#7A8BAD" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10D9A0", display: "inline-block" }} />
          Cambios guardados
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <OrgChartCanvas />
      </div>
    </div>
  );
}
