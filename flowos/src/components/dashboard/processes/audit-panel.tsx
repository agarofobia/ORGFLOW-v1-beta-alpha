"use client";

// Panel de auditoría + métricas de proceso.
// Se monta como modal full-screen overlay sobre el editor BPM.
// Fetcha /api/processes/[id]/events y muestra:
//  - Stats cards: total / completadas / tasa de éxito / duración promedio
//  - Tabla: cycle time por nodo (ordenado por avg desc — los más lentos arriba)
//  - Timeline: lista vertical de eventos con actor, timestamp, tipo
//  - Filtros: instancia, tipo de evento

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Activity, TrendingUp, Clock, AlertTriangle, RefreshCw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  instanceId: string | null;
  nodeId: string | null;
  nodeLabel: string | null;
  event: string;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorImageUrl: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface NodeStat {
  nodeId: string;
  nodeLabel: string;
  completedCount: number;
  avgDurationMs: number;
  maxDurationMs: number;
}

interface Metrics {
  totalInstances: number;
  completedInstances: number;
  failedInstances: number;
  cancelledInstances: number;
  successRate: number;
  avgInstanceDurationMs: number | null;
  nodeStats: NodeStat[];
}

// ─── Event metadata ──────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; color: string }> = {
  instance_started: { label: "Instancia iniciada", color: "#3D7EFF" },
  instance_completed: { label: "Instancia completada", color: "#10D9A0" },
  instance_failed: { label: "Instancia fallida", color: "#F43F5E" },
  instance_cancelled: { label: "Instancia cancelada", color: "#F59E0B" },
  instance_paused: { label: "Instancia pausada", color: "#7A8BAD" },
  node_entered: { label: "Nodo iniciado", color: "#7A8BAD" },
  node_completed: { label: "Nodo completado", color: "#10D9A0" },
  inbox_task_created: { label: "Tarea creada", color: "#3D7EFF" },
  inbox_task_claimed: { label: "Tarea reclamada", color: "#A855F7" },
  inbox_task_completed: { label: "Tarea completada", color: "#10D9A0" },
  milestone_linked_completed: { label: "Hito vinculado completado", color: "#A855F7" },
  project_auto_created: { label: "Proyecto auto-creado", color: "#A855F7" },
  definition_published: { label: "Proceso publicado", color: "#10D9A0" },
  definition_archived: { label: "Proceso archivado", color: "#F59E0B" },
};

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#0E1220",
        border: "1px solid #1E2540",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `${color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={14} style={{ color }} strokeWidth={1.75} />
        </div>
        <p
          style={{
            fontSize: 10,
            color: "#7A8BAD",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
            fontFamily: "monospace",
          }}
        >
          {label}
        </p>
      </div>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#E2E8F8",
          margin: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function AuditPanel({
  processId,
  onClose,
}: {
  processId: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("");
  const [instanceFilter, setInstanceFilter] = useState<string>("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (eventFilter) qs.set("event", eventFilter);
      if (instanceFilter) qs.set("instanceId", instanceFilter);
      const url = `/api/processes/${processId}/events${qs.toString() ? `?${qs}` : ""}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("Failed to fetch");
      const data = await r.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
      setMetrics(data.metrics ?? null);
    } catch {
      setEvents([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId, eventFilter, instanceFilter]);

  // Cerrar con Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lista de instancias únicas que aparecen en los eventos (para el filtro)
  const instanceOptions = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((e) => {
      if (e.instanceId) ids.add(e.instanceId);
    });
    return Array.from(ids);
  }, [events]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "clamp(0px, 4vh, 32px) clamp(0px, 4vw, 32px)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#080B12",
          border: "1px solid #1E2540",
          borderRadius: 12,
          width: "100%",
          maxWidth: 1200,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #1E2540",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Activity size={18} style={{ color: "#3D7EFF" }} strokeWidth={1.75} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F8", margin: 0 }}>
              Auditoría y métricas
            </p>
            <p
              style={{
                fontSize: 11,
                color: "#7A8BAD",
                margin: "2px 0 0",
                fontFamily: "monospace",
              }}
            >
              audit trail · cycle time · throughput
            </p>
          </div>
          <button
            onClick={fetchData}
            title="Refrescar"
            aria-label="Refrescar"
            style={{
              background: "transparent",
              border: "1px solid #1E2540",
              color: "#7A8BAD",
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
            }}
          >
            <RefreshCw size={12} />
            Refrescar
          </button>
          <button
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: "none",
              color: "#7A8BAD",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: 48,
              }}
            >
              <Loader2 size={20} className="animate-spin" style={{ color: "#3D7EFF" }} />
            </div>
          ) : (
            <>
              {/* Metrics */}
              {metrics && (
                <>
                  <p
                    style={{
                      fontSize: 10,
                      color: "#7A8BAD",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      margin: "0 0 12px",
                      fontFamily: "monospace",
                    }}
                  >
                    Resumen
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    <StatCard
                      icon={Activity}
                      label="Instancias totales"
                      value={metrics.totalInstances}
                      color="#3D7EFF"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Tasa de éxito"
                      value={`${metrics.successRate}%`}
                      color="#10D9A0"
                    />
                    <StatCard
                      icon={Clock}
                      label="Duración promedio"
                      value={formatDuration(metrics.avgInstanceDurationMs)}
                      color="#A855F7"
                    />
                    <StatCard
                      icon={AlertTriangle}
                      label="Fallidas + canceladas"
                      value={metrics.failedInstances + metrics.cancelledInstances}
                      color="#F43F5E"
                    />
                  </div>

                  {/* Node stats */}
                  {metrics.nodeStats.length > 0 && (
                    <>
                      <p
                        style={{
                          fontSize: 10,
                          color: "#7A8BAD",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          margin: "0 0 12px",
                          fontFamily: "monospace",
                        }}
                      >
                        Cycle time por nodo · cuellos de botella arriba
                      </p>
                      <div
                        style={{
                          background: "#0E1220",
                          border: "1px solid #1E2540",
                          borderRadius: 10,
                          marginBottom: 24,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 1fr 1fr 1fr",
                            padding: "10px 14px",
                            borderBottom: "1px solid #1E2540",
                            fontSize: 10,
                            color: "#7A8BAD",
                            fontFamily: "monospace",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          <span>Nodo</span>
                          <span style={{ textAlign: "right" }}>Veces</span>
                          <span style={{ textAlign: "right" }}>Promedio</span>
                          <span style={{ textAlign: "right" }}>Máximo</span>
                        </div>
                        {metrics.nodeStats.map((s, i) => {
                          const isBottleneck = i === 0 && metrics.nodeStats.length > 1;
                          return (
                            <div
                              key={s.nodeId}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                                padding: "10px 14px",
                                borderBottom:
                                  i < metrics.nodeStats.length - 1
                                    ? "1px solid #1E2540"
                                    : "none",
                                fontSize: 12,
                                color: "#C4CFEA",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isBottleneck && (
                                  <span title="Cuello de botella">
                                    <AlertTriangle
                                      size={11}
                                      style={{ color: "#F59E0B", flexShrink: 0 }}
                                    />
                                  </span>
                                )}
                                {s.nodeLabel}
                              </span>
                              <span
                                style={{
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: "#7A8BAD",
                                }}
                              >
                                {s.completedCount}
                              </span>
                              <span
                                style={{
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: isBottleneck ? "#F59E0B" : "#E2E8F8",
                                  fontWeight: isBottleneck ? 600 : 400,
                                }}
                              >
                                {formatDuration(s.avgDurationMs)}
                              </span>
                              <span
                                style={{
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  color: "#7A8BAD",
                                }}
                              >
                                {formatDuration(s.maxDurationMs)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Filters */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    color: "#7A8BAD",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    margin: 0,
                    fontFamily: "monospace",
                  }}
                >
                  Timeline de eventos
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value)}
                    style={{
                      background: "#141928",
                      border: "1px solid #1E2540",
                      color: "#C4CFEA",
                      padding: "5px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Todos los eventos</option>
                    {Object.entries(EVENT_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  {instanceOptions.length > 0 && (
                    <select
                      value={instanceFilter}
                      onChange={(e) => setInstanceFilter(e.target.value)}
                      style={{
                        background: "#141928",
                        border: "1px solid #1E2540",
                        color: "#C4CFEA",
                        padding: "5px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      <option value="">Todas las instancias</option>
                      {instanceOptions.map((id) => (
                        <option key={id} value={id}>
                          {id.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Event timeline */}
              {events.length === 0 ? (
                <div
                  style={{
                    padding: 48,
                    textAlign: "center",
                    color: "#7A8BAD",
                    border: "1px dashed #1E2540",
                    borderRadius: 10,
                    background: "#0E1220",
                  }}
                >
                  <Activity
                    size={28}
                    style={{ color: "#1E2540", margin: "0 auto 10px", display: "block" }}
                    strokeWidth={1.5}
                  />
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F8", margin: 0 }}>
                    Sin eventos registrados
                  </p>
                  <p style={{ fontSize: 12, color: "#7A8BAD", margin: "6px 0 0" }}>
                    El audit trail empieza a poblarse cuando se inicia la primera instancia.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: "#0E1220",
                    border: "1px solid #1E2540",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {events.map((e, i) => {
                    const meta = EVENT_META[e.event] ?? {
                      label: e.event,
                      color: "#7A8BAD",
                    };
                    return (
                      <div
                        key={e.id}
                        style={{
                          padding: "10px 14px",
                          borderBottom:
                            i < events.length - 1 ? "1px solid #1E2540" : "none",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: meta.color,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 12,
                              color: "#E2E8F8",
                              margin: 0,
                              fontWeight: 500,
                            }}
                          >
                            {meta.label}
                            {e.nodeLabel && (
                              <span style={{ color: "#7A8BAD", fontWeight: 400 }}>
                                {" "}· {e.nodeLabel}
                              </span>
                            )}
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: "#7A8BAD",
                              margin: "2px 0 0",
                              fontFamily: "monospace",
                            }}
                          >
                            {formatTimestamp(e.createdAt)}
                            {" · "}
                            {e.actorType === "system"
                              ? "sistema"
                              : e.actorName ?? e.actorEmail ?? "—"}
                            {e.instanceId && (
                              <>
                                {" · inst "}
                                {e.instanceId.slice(0, 8)}
                              </>
                            )}
                          </p>
                        </div>
                        {e.durationMs !== null && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#A855F7",
                              fontFamily: "monospace",
                              flexShrink: 0,
                            }}
                          >
                            {formatDuration(e.durationMs)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
