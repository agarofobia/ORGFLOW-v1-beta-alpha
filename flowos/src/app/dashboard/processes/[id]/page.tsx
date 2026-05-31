"use client";

// Página del diseñador de procesos: topbar (nombre, estado, template, environment,
// auditoría, heatmap, fullscreen, iniciar instancia) + carga de la definición y
// composición del editor BPM (DesignerFlow) dentro de un ReactFlowProvider.
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ArrowLeft,
  ChevronDown,
  Activity,
  Maximize2,
  Minimize2,
  Play,
  Loader2,
  Layers,
} from "lucide-react";
import type { ProcessDefinition } from "@/db/schema";
import type { ProcessNode, ProcessEdge, FormField } from "@/lib/process-types";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/hooks/usePermissions";
import AuditPanel from "@/components/dashboard/processes/audit-panel";
import InstancesPanel from "@/components/dashboard/processes/instances-panel";
import { DesignerFlow } from "@/components/dashboard/processes/designer-flow";

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

export default function ProcessDesignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: processId } = use(params);
  const router = useRouter();
  const [definition, setDefinition] = useState<ProcessDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const toast = useToast();
  // Templates de proyecto disponibles para asociar al proceso (cierra el loop BPM ↔ Proyectos)
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  useEffect(() => {
    fetch("/api/project-templates").then(r => r.ok ? r.json() : [])
      .then(data => setTemplates(Array.isArray(data) ? data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) : []))
      .catch(() => setTemplates([]));
  }, []);
  const [environment, setEnvironment] = useState<"test" | "production">("production");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [instancesOpen, setInstancesOpen] = useState(false);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [heatmapData, setHeatmapData] = useState<Record<string, { color: string; label: string }>>({});
  const { can: canDo } = usePermissions();
  const canAudit = canDo("processes", "create");

  // Fetch heatmap data cuando se prende el toggle.
  // Calcula color por nodo basado en avgDurationMs (percentil simple).
  useEffect(() => {
    if (!heatmapOn) {
      setHeatmapData({});
      return;
    }
    fetch(`/api/processes/${processId}/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const nodeStats = data?.metrics?.nodeStats as Array<{ nodeId: string; nodeLabel: string; avgDurationMs: number }> | undefined;
        if (!Array.isArray(nodeStats) || nodeStats.length === 0) {
          setHeatmapData({});
          return;
        }
        // Calcular percentiles
        const durations = nodeStats.map((n) => n.avgDurationMs).filter((d) => d > 0);
        if (durations.length === 0) return;
        const sorted = [...durations].sort((a, b) => a - b);
        const p33 = sorted[Math.floor(sorted.length * 0.33)];
        const p66 = sorted[Math.floor(sorted.length * 0.66)];

        const map: Record<string, { color: string; label: string }> = {};
        for (const stat of nodeStats) {
          if (stat.avgDurationMs <= 0) continue;
          const color =
            stat.avgDurationMs <= p33 ? "#10D9A0" :    // verde — rápido
            stat.avgDurationMs <= p66 ? "#F59E0B" :    // ámbar — medio
            "#F43F5E";                                  // rojo — cuello de botella
          const s = stat.avgDurationMs / 1000;
          const label =
            s < 60 ? `${s.toFixed(1)}s avg` :
            s < 3600 ? `${(s / 60).toFixed(1)}m avg` :
            `${(s / 3600).toFixed(1)}h avg`;
          map[stat.nodeId] = { color, label };
        }
        setHeatmapData(map);
      })
      .catch(() => setHeatmapData({}));
  }, [heatmapOn, processId]);
  // Refs para click-outside en dropdowns del topbar
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  // Cierra status dropdown si se clickea afuera
  useEffect(() => {
    if (!statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as unknown as globalThis.Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusOpen]);

  // Cierra template dropdown si se clickea afuera
  useEffect(() => {
    if (!templateOpen) return;
    const handler = (e: MouseEvent) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as unknown as globalThis.Node)) {
        setTemplateOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [templateOpen]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Escape para salir de fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  useEffect(() => {
    fetch(`/api/processes/${processId}`)
      .then((r) => r.json())
      .then((data) => {
        setDefinition(data);
        setName(data.name);
      })
      .finally(() => setLoading(false));
  }, [processId]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const handleSave = async (nodes: ProcessNode[], edges: ProcessEdge[], formFields: FormField[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/processes/${processId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes,
          edges,
          formFields,
          status: definition?.status,
          category: definition?.category,
          environment,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDefinition(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: "draft" | "active" | "archived") => {
    setStatusOpen(false);
    // Validación pre-activación: un proceso publicado tiene que ser ejecutable.
    // Sin startEvent o endEvent → al iniciar instancia el motor BPM crashea.
    if (status === "active" && definition) {
      const nodes = (definition.nodes ?? []) as unknown as ProcessNode[];
      const hasStart = Array.isArray(nodes) && nodes.some(n => n.type === "startEvent");
      const hasEnd = Array.isArray(nodes) && nodes.some(n => n.type === "endEvent");
      if (!hasStart || !hasEnd) {
        const missing = [!hasStart && "Inicio", !hasEnd && "Fin"].filter(Boolean).join(" y ");
        toast.error("No se puede publicar", `Falta nodo ${missing}. Agregalo desde la paleta antes de activar.`);
        return;
      }
    }
    const res = await fetch(`/api/processes/${processId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDefinition(updated);
      if (status === "active") toast.success("Proceso publicado", "Ya podés iniciar instancias.");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error("No se pudo cambiar el estado", err.error ?? "Error desconocido");
    }
  };

  const handleStart = async () => {
    const res = await fetch(`/api/processes/${processId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: {} }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.projectId) {
        // Proyecto creado: toast con CTA implícito (la nav la maneja el user via /dashboard/projects)
        toast.success("Instancia iniciada + proyecto creado", "Abrí Proyectos para ver la estructura armada.");
        // Auto-redirect después de 1.5s para no quedar bloqueado
        setTimeout(() => { window.location.href = `/dashboard/projects?id=${data.projectId}`; }, 1500);
      } else {
        toast.success("Instancia iniciada", `ID: ${String(data.instanceId).slice(0, 8)}`);
      }
    } else {
      toast.error("No se pudo iniciar", data.error);
    }
  };

  // Cambiar template asociado al proceso
  const handleTemplateChange = async (templateId: string | null) => {
    const res = await fetch(`/api/processes/${processId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectTemplateId: templateId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDefinition(updated);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p style={{ color: "var(--c-text-muted)" }}>Proceso no encontrado</p>
        <button
          onClick={() => router.push("/dashboard/processes")}
          className="text-sm"
          style={{ color: "var(--c-accent-blue)" }}
        >
          ← Volver a procesos
        </button>
      </div>
    );
  }

  const statusColor =
    definition.status === "active"
      ? "var(--c-accent-emerald)"
      : definition.status === "archived"
      ? "var(--c-accent-amber)"
      : "var(--c-text-muted)";

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--c-bg-base)",
        ...(isFullscreen
          ? { position: "fixed", inset: 0, zIndex: 60, height: "100vh" }
          : { height: "100%" }),
      }}
    >
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-base)" }}
      >
        <button
          onClick={() => router.push("/dashboard/processes")}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors hover:bg-[var(--c-bg-elevated)]"
          style={{ color: "var(--c-text-muted)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div style={{ width: 1, height: 20, background: "var(--c-border)" }} />

        {/* Editable name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="rounded px-2 py-1 text-sm font-medium outline-none"
            style={{
              background: "var(--c-bg-elevated)",
              border: "1px solid var(--c-accent-blue)",
              color: "var(--c-text-primary)",
              minWidth: 200,
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={{ color: "var(--c-text-primary)" }}
          >
            {name}
          </button>
        )}

        {/* Status dropdown */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            onClick={() => setStatusOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={{ color: statusColor }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: statusColor }}
            />
            {STATUS_LABELS[definition.status]}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg py-1"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", minWidth: 130 }}
            >
              {(["draft", "active", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className="px-3 py-2 text-left text-xs hover:bg-[var(--c-bg-elevated)]"
                  style={{ color: "var(--c-text-secondary)" }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template de proyecto asociado — cierra el loop BPM */}
        <div className="relative" ref={templateDropdownRef}>
          <button
            onClick={() => setTemplateOpen(v => !v)}
            title="Template de proyecto que se instancia al iniciar este proceso"
            className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={{
              color: definition.projectTemplateId ? "var(--c-accent-violet)" : "var(--c-text-muted)",
              border: `1px solid ${definition.projectTemplateId ? "rgb(var(--c-accent-violet-rgb) / 0.4)" : "var(--c-border)"}`,
            }}
          >
            <span style={{ fontSize: 11 }}>⚐</span>
            {definition.projectTemplateId
              ? (templates.find(t => t.id === definition.projectTemplateId)?.name ?? "Template").slice(0, 20)
              : "Sin template"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {templateOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg py-1"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", minWidth: 220, maxHeight: 260, overflowY: "auto" }}
            >
              <button
                onClick={() => { handleTemplateChange(null); setTemplateOpen(false); }}
                className="px-3 py-2 text-left text-xs hover:bg-[var(--c-bg-elevated)]"
                style={{ color: definition.projectTemplateId ? "var(--c-text-muted)" : "var(--c-accent-red)", borderBottom: "1px solid var(--c-border)" }}
              >
                ✕ Sin template
              </button>
              {templates.length === 0 ? (
                <p className="px-3 py-3 text-xs italic" style={{ color: "var(--c-text-muted)" }}>
                  Creá templates en /dashboard/projects
                </p>
              ) : templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { handleTemplateChange(t.id); setTemplateOpen(false); }}
                  className="px-3 py-2 text-left text-xs hover:bg-[var(--c-bg-elevated)]"
                  style={{
                    color: definition.projectTemplateId === t.id ? "var(--c-accent-violet)" : "var(--c-text-secondary)",
                    background: definition.projectTemplateId === t.id ? "rgb(var(--c-accent-violet-rgb) / 0.08)" : "transparent",
                  }}
                >
                  ⚐ {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Environment toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
          {(["test", "production"] as const).map((env) => (
            <button
              key={env}
              onClick={() => setEnvironment(env)}
              className="px-3 py-1 font-mono text-[10px] uppercase transition-colors"
              style={
                environment === env
                  ? { background: env === "test" ? "rgb(var(--c-accent-amber-rgb) / 0.15)" : "rgb(var(--c-accent-emerald-rgb) / 0.12)",
                      color: env === "test" ? "var(--c-accent-amber)" : "var(--c-accent-emerald)" }
                  : { background: "transparent", color: "var(--c-text-dim)" }
              }
            >
              {env === "test" ? "Test" : "Prod"}
            </button>
          ))}
        </div>

        {/* Indicador de estado de guardado:
            - "● Sin guardar" rojo si hay cambios pendientes
            - "✓ Guardado" verde durante 2.5s post-save (saved flag)
            - silencioso si todo está limpio */}
        {editorDirty && !saved && (
          <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: "var(--c-accent-red)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-accent-red)" }} />
            Sin guardar
          </span>
        )}
        {saved && (
          <span className="font-mono text-[11px]" style={{ color: "var(--c-accent-emerald)" }}>
            ✓ Guardado
          </span>
        )}

        <button
          onClick={() => setInstancesOpen(true)}
          title="Instancias en ejecución de este proceso"
          aria-label="Instancias"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
          style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Instancias</span>
        </button>

        {canAudit && (
          <button
            onClick={() => setAuditOpen(true)}
            title="Auditoría y métricas (requiere permiso de crear procesos)"
            aria-label="Auditoría y métricas"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
            style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Auditoría</span>
          </button>
        )}

        {canAudit && (
          <button
            onClick={() => setHeatmapOn((v) => !v)}
            title={heatmapOn ? "Apagar heatmap de cycle time" : "Mostrar cycle time por nodo (verde=rápido, rojo=lento)"}
            aria-label="Toggle heatmap"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
            style={{
              color: heatmapOn ? "#F43F5E" : "var(--c-text-muted)",
              border: `1px solid ${heatmapOn ? "rgb(244 63 94 / 0.4)" : "var(--c-border)"}`,
              background: heatmapOn ? "rgb(244 63 94 / 0.08)" : "transparent",
            }}
          >
            <span style={{ fontSize: 11 }}>🔥</span>
            <span className="hidden md:inline">Heatmap</span>
          </button>
        )}

        <button
          onClick={() => setIsFullscreen(v => !v)}
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--c-bg-elevated)]"
          style={{ color: isFullscreen ? "var(--c-accent-blue)" : "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
        >
          {isFullscreen
            ? <Minimize2 className="h-3.5 w-3.5" />
            : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        {definition.status === "active" && (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: "rgb(var(--c-accent-emerald-rgb) / 0.1)",
              color: "var(--c-accent-emerald)",
              border: "1px solid rgb(var(--c-accent-emerald-rgb) / 0.25)",
            }}
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" />
            Iniciar instancia
          </button>
        )}
      </div>

      {/* Designer canvas */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ReactFlowProvider>
          <DesignerFlow
            definition={definition}
            onSave={handleSave}
            saving={saving}
            onDirtyChange={setEditorDirty}
            heatmapData={heatmapData}
          />
        </ReactFlowProvider>
      </div>

      {auditOpen && <AuditPanel processId={processId} onClose={() => setAuditOpen(false)} />}
      {instancesOpen && (
        <InstancesPanel
          processId={processId}
          nodes={((definition.nodes ?? []) as unknown as ProcessNode[]).map((n) => ({ id: n.id, label: n.label, expectedDurationMs: n.expectedDurationMs }))}
          formFields={((definition.formFields ?? []) as unknown as FormField[]).map((f) => ({ id: f.id, label: f.label }))}
          onClose={() => setInstancesOpen(false)}
        />
      )}
    </div>
  );
}
