"use client";

// Webhooks salientes — gestión desde Settings.
// Solo visible para users con settings.manage.
// El secret se muestra UNA SOLA VEZ al crear (one-time-reveal pattern).

import { useCallback, useEffect, useState } from "react";
import { Webhook, Plus, Trash2, ChevronDown, ChevronRight, Copy, Check, Eye } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface Subscription {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface Delivery {
  id: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  errorMessage: string | null;
  createdAt: string;
}

const EVENT_GROUPS: { label: string; events: string[] }[] = [
  { label: "Tareas", events: ["task.created", "task.assigned", "task.completed", "task.status_changed"] },
  { label: "Proyectos", events: ["project.created", "project.completed", "project.vfp_updated"] },
  { label: "Hitos", events: ["milestone.created", "milestone.completed"] },
  { label: "Procesos BPM", events: ["process.instance_started", "process.instance_completed", "process.instance_failed", "process.task_created", "process.task_completed"] },
  { label: "Empleados", events: ["employee.created"] },
];

export default function WebhooksSection() {
  const { can, loading: permsLoading } = usePermissions();
  const canManage = can("settings", "manage");
  const canView = can("settings", "view");

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());
  const [creatingBusy, setCreatingBusy] = useState(false);

  // One-time-reveal del secret recién creado
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Detalle expandido
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/webhook-subscriptions");
      if (r.ok) {
        const data = await r.json();
        setSubs(Array.isArray(data.subscriptions) ? data.subscriptions : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const loadDeliveries = async (id: string) => {
    if (deliveries[id]) return;
    const r = await fetch(`/api/webhook-subscriptions/${id}`);
    if (r.ok) {
      const data = await r.json();
      setDeliveries((prev) => ({ ...prev, [id]: data.recentDeliveries ?? [] }));
    }
  };

  const create = async () => {
    if (!newName.trim() || !newUrl.trim() || newEvents.size === 0) return;
    setCreatingBusy(true);
    try {
      const r = await fetch("/api/webhook-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          url: newUrl.trim(),
          events: Array.from(newEvents),
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: "Error" }));
        alert(data.error ?? "No se pudo crear");
        return;
      }
      const data = await r.json();
      setRevealedSecret({ id: data.subscription.id, secret: data.secret });
      setNewName("");
      setNewUrl("");
      setNewEvents(new Set());
      setCreating(false);
      await load();
    } finally {
      setCreatingBusy(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/webhook-subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este webhook? Las entregas pendientes se descartan.")) return;
    await fetch(`/api/webhook-subscriptions/${id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((s) => s.id !== id));
    if (revealedSecret?.id === id) setRevealedSecret(null);
  };

  const copySecret = (s: string) => {
    navigator.clipboard.writeText(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (permsLoading) return null;
  if (!canView) return null;

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
            Integraciones
          </p>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--c-text-primary)" }}>
            Webhooks
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--c-text-muted)" }}>
            Conectá FlowOS con cualquier herramienta externa (Slack, Make, Zapier, sistema propio). Te enviamos eventos en tiempo real con firma HMAC-SHA256.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
            style={{ background: "var(--c-accent-blue)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo webhook
          </button>
        )}
      </div>

      {/* Form de creación */}
      {creating && canManage && (
        <div
          className="mb-4 rounded-lg p-4"
          style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del webhook"
              className="rounded px-3 py-2 text-sm outline-none"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://tu-app.com/webhook"
              className="rounded px-3 py-2 text-sm outline-none font-mono"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            />
          </div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
            Eventos a recibir
          </p>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EVENT_GROUPS.map((g) => (
              <div key={g.label} className="rounded p-2" style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)" }}>
                <p className="mb-1 text-xs font-semibold" style={{ color: "var(--c-text-primary)" }}>{g.label}</p>
                <div className="flex flex-col gap-1">
                  {g.events.map((ev) => (
                    <label key={ev} className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={newEvents.has(ev)}
                        onChange={(e) => {
                          const next = new Set(newEvents);
                          if (e.target.checked) next.add(ev); else next.delete(ev);
                          setNewEvents(next);
                        }}
                      />
                      <span className="font-mono">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="rounded px-3 py-1.5 text-xs" style={{ background: "var(--c-bg-elevated)", color: "var(--c-text-secondary)", border: "1px solid var(--c-border)" }}>
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={creatingBusy || !newName.trim() || !newUrl.trim() || newEvents.size === 0}
              className="rounded px-4 py-1.5 text-xs font-medium text-white"
              style={{ background: "var(--c-accent-blue)", opacity: creatingBusy || !newName.trim() || !newUrl.trim() || newEvents.size === 0 ? 0.5 : 1 }}
            >
              {creatingBusy ? "Creando…" : "Crear webhook"}
            </button>
          </div>
        </div>
      )}

      {/* Secret revelado (one-time) */}
      {revealedSecret && (
        <div
          className="mb-4 rounded-lg p-4"
          style={{
            background: "rgb(var(--c-accent-amber-rgb) / 0.08)",
            border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.3)",
          }}
        >
          <p className="mb-1 text-sm font-semibold" style={{ color: "var(--c-accent-amber)" }}>
            ⚠ Guardá este secret AHORA
          </p>
          <p className="mb-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
            No lo vas a ver más. Lo necesitás para verificar la firma HMAC en tu receptor.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 rounded px-3 py-2 font-mono text-xs" style={{ background: "var(--c-bg-base)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}>
              {revealedSecret.secret}
            </code>
            <button
              onClick={() => copySecret(revealedSecret.secret)}
              className="flex items-center gap-1 rounded px-3 py-2 text-xs"
              style={{ background: copied ? "var(--c-accent-emerald)" : "var(--c-bg-elevated)", color: copied ? "#fff" : "var(--c-text-primary)", border: "1px solid var(--c-border)" }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={() => setRevealedSecret(null)}
              className="rounded px-3 py-2 text-xs"
              style={{ background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Lista de subscriptions */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>Cargando…</p>
      ) : subs.length === 0 ? (
        <div className="flo-empty-state">
          <Webhook size={28} strokeWidth={1.5} />
          <p className="flo-empty-state-title">Sin webhooks configurados</p>
          <p className="flo-empty-state-desc">Conectá FlowOS con cualquier app externa que pueda recibir POST requests. Slack, Make, Zapier, sistemas propios.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {subs.map((s) => {
            const expanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className="rounded-lg overflow-hidden"
                style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
              >
                <div
                  className="flex cursor-pointer items-center gap-3 p-4"
                  onClick={() => {
                    setExpandedId(expanded ? null : s.id);
                    if (!expanded) loadDeliveries(s.id);
                  }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: s.active ? "rgb(var(--c-accent-emerald-rgb) / 0.12)" : "var(--c-bg-elevated)" }}>
                    <Webhook className="h-4 w-4" style={{ color: s.active ? "var(--c-accent-emerald)" : "var(--c-text-muted)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>{s.name}</p>
                    <p className="font-mono text-[11px]" style={{ color: "var(--c-text-muted)" }}>{s.url}</p>
                  </div>
                  <span className={`flo-chip ${s.active ? "flo-chip-success" : "flo-chip-muted"}`}>
                    {s.active ? "Activo" : "Pausado"}
                  </span>
                  <span className="hidden text-xs sm:inline" style={{ color: "var(--c-text-muted)" }}>
                    {s.events.length} eventos
                  </span>
                  {canManage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActive(s.id, !s.active); }}
                      className="rounded p-1.5 transition-colors"
                      title={s.active ? "Pausar" : "Activar"}
                      style={{ color: "var(--c-text-muted)" }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                      className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                      style={{ color: "var(--c-text-muted)" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {expanded ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--c-text-muted)" }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--c-text-muted)" }} />}
                </div>

                {expanded && (
                  <div className="border-t px-4 py-3" style={{ borderColor: "var(--c-border)" }}>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Eventos suscriptos</p>
                    <div className="mb-3 flex flex-wrap gap-1">
                      {s.events.map((ev) => (
                        <span key={ev} className="flo-chip flo-chip-info">{ev}</span>
                      ))}
                    </div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Últimas entregas</p>
                    {!deliveries[s.id] ? (
                      <p className="text-xs" style={{ color: "var(--c-text-muted)" }}>Cargando…</p>
                    ) : deliveries[s.id].length === 0 ? (
                      <p className="text-xs italic" style={{ color: "var(--c-text-muted)" }}>Sin entregas todavía. Esperando primer evento.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {deliveries[s.id].slice(0, 8).map((d) => (
                          <div key={d.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs" style={{ background: "var(--c-bg-elevated)" }}>
                            <span className={`flo-chip ${d.status === "success" ? "flo-chip-success" : d.status === "failed" ? "flo-chip-danger" : "flo-chip-muted"}`}>
                              {d.status}
                            </span>
                            <span className="font-mono" style={{ color: "var(--c-text-secondary)" }}>{d.eventType}</span>
                            {d.responseCode && (
                              <span className="font-mono" style={{ color: "var(--c-text-muted)" }}>HTTP {d.responseCode}</span>
                            )}
                            <span className="ml-auto text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                              {new Date(d.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
