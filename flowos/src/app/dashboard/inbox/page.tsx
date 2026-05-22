"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  ChevronDown,
  Play,
  GitBranch,
  ExternalLink,
  Eye,
  Trash2,
  XCircle,
} from "lucide-react";
import type { InboxTask, ProcessDefinition, ProcessInstance } from "@/db/schema";
import TaskRunnerModal from "./TaskRunnerModal";
import { useToast } from "@/components/ui/toast";

const PRIORITY_CONFIG = {
  low: { label: "Baja", color: "#7A8BAD" },
  medium: { label: "Media", color: "#3D7EFF" },
  high: { label: "Alta", color: "#F59E0B" },
  critical: { label: "Crítica", color: "#F43F5E" },
};

const STATUS_CONFIG = {
  pending: { label: "Pendiente", color: "#F59E0B", icon: Clock },
  claimed: { label: "En progreso", color: "#3D7EFF", icon: Play },
  completed: { label: "Completada", color: "#10D9A0", icon: CheckCircle2 },
  skipped: { label: "Omitida", color: "#7A8BAD", icon: ChevronDown },
  cancelled: { label: "Cancelada", color: "#F43F5E", icon: AlertCircle },
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const INSTANCE_STATUS = {
  running: { label: "En curso", color: "#3D7EFF" },
  completed: { label: "Completado", color: "#10D9A0" },
  cancelled: { label: "Cancelado", color: "#F43F5E" },
  error: { label: "Error", color: "#F59E0B" },
};

export default function InboxPage() {
  const router = useRouter();
  const toast = useToast();
  const [mainTab, setMainTab] = useState<"tasks" | "tracking">("tasks");
  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [processes, setProcesses] = useState<ProcessDefinition[]>([]);
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runnerTaskId, setRunnerTaskId] = useState<string | null>(null);
  const [startingProcess, setStartingProcess] = useState<string | null>(null);
  const [deletingInstance, setDeletingInstance] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        fetch(`/api/inbox?status=${statusFilter}`),
        fetch(`/api/processes`),
      ]);
      if (tRes.ok) setTasks(await tRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        setProcesses(Array.isArray(data) ? data.filter((p: ProcessDefinition) => p.status === "active") : []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchInstances = useCallback(async () => {
    setTrackingLoading(true);
    try {
      const res = await fetch("/api/instances");
      if (res.ok) setInstances(await res.json());
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === "tracking") fetchInstances();
  }, [mainTab, fetchInstances]);

  const deleteInstance = async (id: string) => {
    if (!confirm("¿Cancelar y eliminar esta instancia? Se borrarán también sus tareas.")) return;
    setDeletingInstance(id);
    try {
      await fetch(`/api/instances/${id}`, { method: "DELETE" });
      setInstances(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeletingInstance(null);
    }
  };

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const startProcess = async (id: string) => {
    setStartingProcess(id);
    try {
      const res = await fetch(`/api/processes/${id}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: {} }),
      });
      if (res.ok) {
        await fetchTasks();
        toast.success("Proceso iniciado");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("No se pudo iniciar el proceso", data.error ?? "desconocido");
      }
    } finally {
      setStartingProcess(null);
    }
  };

  const handleAction = async (taskId: string, action: "claim" | "complete" | "skip") => {
    setActionLoading(taskId + action);
    try {
      const res = await fetch(`/api/inbox/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchTasks();
      } else {
        const data = await res.json();
        toast.error("Error", data.error ?? "No se pudo completar la acción");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const FILTERS = [
    { value: "pending", label: "Pendientes" },
    { value: "claimed", label: "En progreso" },
    { value: "completed", label: "Completadas" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
            BPM
          </p>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: "#E2E8F8" }}>
            Bandeja de tareas
          </h1>
        </div>
      </div>

      {/* Main tabs */}
      <div className="mb-6 flex gap-1 rounded-lg p-1" style={{ background: "#0A0F1C", border: "1px solid #1E2540", width: "fit-content" }}>
        {([
          { key: "tasks", label: "Mis tareas", icon: <Inbox className="h-3.5 w-3.5" /> },
          { key: "tracking", label: "Seguimiento", icon: <Eye className="h-3.5 w-3.5" /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className="flex items-center gap-2 rounded px-4 py-1.5 text-sm font-medium transition-all"
            style={mainTab === key
              ? { background: "rgba(61,126,255,0.15)", color: "#3D7EFF" }
              : { color: "#7A8BAD" }
            }
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {mainTab === "tracking" && (
        <div>
          <p className="mb-4 text-sm" style={{ color: "#7A8BAD" }}>
            Todas las instancias de proceso activas e históricas de la organización.
          </p>
          {trackingLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#3D7EFF" }} />
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg py-24"
              style={{ background: "#0E1220", border: "1px dashed #1E2540" }}>
              <Eye className="mb-4 h-10 w-10" style={{ color: "#1E2540" }} strokeWidth={1} />
              <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>No hay instancias todavía</p>
              <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>Las instancias aparecen al iniciar un proceso</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {instances.map(inst => {
                const cfg = INSTANCE_STATUS[inst.status as keyof typeof INSTANCE_STATUS] ?? INSTANCE_STATUS.running;
                const history = Array.isArray(inst.history) ? inst.history as { nodeId: string; completedAt: string }[] : [];
                return (
                  <div key={inst.id} className="rounded-lg p-4"
                    style={{ background: "#0E1220", border: "1px solid #1E2540" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>{inst.processName}</p>
                          <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase"
                            style={{ background: `${cfg.color}18`, color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-4">
                          <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                            Nodo actual: <span style={{ color: "#C4CFEA" }}>{inst.currentNodeId}</span>
                          </span>
                          <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                            {history.length} pasos completados
                          </span>
                          <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                            Iniciado: {formatDate(inst.startedAt)}
                          </span>
                          {inst.completedAt && (
                            <span className="font-mono text-[10px]" style={{ color: "#10D9A0" }}>
                              Completado: {formatDate(inst.completedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteInstance(inst.id)}
                        disabled={deletingInstance === inst.id}
                        className="shrink-0 rounded p-1.5 transition-colors hover:bg-[#F43F5E20] disabled:opacity-50"
                        style={{ color: "#7A8BAD" }}
                        title="Eliminar instancia"
                      >
                        {deletingInstance === inst.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {mainTab === "tasks" && <>
      {/* Available processes */}
      <div className="mb-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
          Iniciar proceso
        </p>
        {processes.length === 0 ? (
          <div
            className="flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ background: "#0E1220", border: "1px dashed #1E2540" }}
          >
            <GitBranch className="h-4 w-4" style={{ color: "#7A8BAD" }} />
            <p className="flex-1 text-sm" style={{ color: "#7A8BAD" }}>
              Todavía no hay procesos activos disponibles
            </p>
            <button
              onClick={() => router.push("/dashboard/processes")}
              className="flex items-center gap-1.5 rounded px-3 py-1 text-xs"
              style={{ background: "rgba(61,126,255,0.12)", color: "#3D7EFF", border: "1px solid rgba(61,126,255,0.25)" }}
            >
              <ExternalLink className="h-3 w-3" />
              Crear proceso
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {processes.map(p => (
              <button
                key={p.id}
                onClick={() => startProcess(p.id)}
                disabled={startingProcess === p.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all hover:-translate-y-px disabled:opacity-50"
                style={{ background: "#0E1220", border: "1px solid #1E2540", color: "#E2E8F8" }}
              >
                {startingProcess === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#3D7EFF" }} />
                ) : (
                  <Play className="h-3.5 w-3.5" fill="#10D9A0" style={{ color: "#10D9A0" }} />
                )}
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-1 rounded-lg p-1" style={{ background: "#0E1220", border: "1px solid #1E2540", width: "fit-content" }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className="rounded px-4 py-1.5 text-sm font-medium transition-all"
            style={
              statusFilter === f.value
                ? { background: "rgba(61,126,255,0.15)", color: "#3D7EFF" }
                : { color: "#7A8BAD" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#3D7EFF" }} />
        </div>
      ) : tasks.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg py-24"
          style={{ background: "#0E1220", border: "1px dashed #1E2540" }}
        >
          <Inbox className="mb-4 h-10 w-10" style={{ color: "#1E2540" }} strokeWidth={1} />
          <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>
            No hay tareas en esta sección
          </p>
          <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>
            Las tareas aparecen cuando se inicia una instancia de proceso
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => {
            const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
            const status = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = status.icon;

            return (
              <div
                key={task.id}
                className="rounded-lg p-4"
                style={{ background: "#0E1220", border: "1px solid #1E2540" }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>
                        {task.nodeLabel}
                      </p>
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase"
                        style={{ background: `${priority.color}18`, color: priority.color }}
                      >
                        {priority.label}
                      </span>
                      <span
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase"
                        style={{ background: `${status.color}18`, color: status.color }}
                      >
                        <StatusIcon className="h-2.5 w-2.5" />
                        {status.label}
                      </span>
                    </div>

                    <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>
                      {task.processName}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      {task.assignedToDeptId && (
                        <span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                          <User className="h-3 w-3" />
                          Dept: {task.assignedToDeptId.slice(0, 8)}…
                        </span>
                      )}
                      {task.claimedBy && (
                        <span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                          <User className="h-3 w-3" />
                          {task.claimedBy.slice(0, 10)}…
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="font-mono text-[10px]" style={{ color: "#F59E0B" }}>
                          Vence: {formatDate(task.dueDate)}
                        </span>
                      )}
                      <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                        {formatDate(task.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {task.status === "pending" && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleAction(task.id, "claim")}
                        disabled={actionLoading === task.id + "claim"}
                        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60"
                        style={{
                          background: "rgba(61,126,255,0.1)",
                          color: "#3D7EFF",
                          border: "1px solid rgba(61,126,255,0.2)",
                        }}
                      >
                        {actionLoading === task.id + "claim" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" fill="currentColor" />
                        )}
                        Tomar
                      </button>
                      <button
                        onClick={() => handleAction(task.id, "skip")}
                        disabled={actionLoading === task.id + "skip"}
                        className="rounded px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60 hover:bg-[#1E2540]"
                        style={{ color: "#7A8BAD" }}
                      >
                        Omitir
                      </button>
                    </div>
                  )}

                  {task.status === "claimed" && (
                    <button
                      onClick={() => setRunnerTaskId(task.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all"
                      style={{
                        background: "rgba(16,217,160,0.1)",
                        color: "#10D9A0",
                        border: "1px solid rgba(16,217,160,0.2)",
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Completar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>}

      {runnerTaskId && (
        <TaskRunnerModal
          taskId={runnerTaskId}
          onClose={() => setRunnerTaskId(null)}
          onCompleted={() => {
            setRunnerTaskId(null);
            fetchTasks();
          }}
        />
      )}
    </div>
  );
}
