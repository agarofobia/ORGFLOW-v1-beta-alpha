"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  GitBranch,
  Play,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  Archive,
} from "lucide-react";
import type { ProcessDefinition } from "@/db/schema";

const STATUS_CONFIG = {
  draft: { label: "Borrador", color: "#7A8BAD", bg: "rgba(122,139,173,0.12)" },
  active: { label: "Activo", color: "#10D9A0", bg: "rgba(16,217,160,0.12)" },
  archived: { label: "Archivado", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
};

const STATUS_ICONS = {
  draft: Clock,
  active: CheckCircle2,
  archived: Archive,
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ProcessesPage() {
  const router = useRouter();
  const [processes, setProcesses] = useState<ProcessDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch("/api/processes");
      if (res.ok) setProcesses(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nuevo proceso" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/dashboard/processes/${data.id}`);
      } else {
        console.error("Error creando proceso:", data);
        alert(`Error: ${data.error ?? JSON.stringify(data)}`);
      }
    } catch (err) {
      console.error("Network error:", err);
      alert(`Error de red: ${String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este proceso?")) return;
    await fetch(`/api/processes/${id}`, { method: "DELETE" });
    setProcesses((prev) => prev.filter((p) => p.id !== id));
  };

  const handleStart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/processes/${id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: {} }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Instancia iniciada: ${data.instanceId}`);
    } else {
      alert(`Error: ${data.error}`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: "#7A8BAD" }}
          >
            BPM
          </p>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: "#E2E8F8" }}>
            Procesos
          </h1>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px disabled:opacity-60"
          style={{
            background: "#3D7EFF",
            boxShadow: "0 0 16px rgba(61,126,255,0.35)",
          }}
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          )}
          Nuevo proceso
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#3D7EFF" }} />
        </div>
      ) : processes.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg py-24"
          style={{ background: "#0E1220", border: "1px dashed #1E2540" }}
        >
          <GitBranch className="mb-4 h-10 w-10" style={{ color: "#1E2540" }} strokeWidth={1} />
          <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>
            No hay procesos todavía
          </p>
          <p className="mt-1 text-xs" style={{ color: "#7A8BAD" }}>
            Creá el primero para empezar a diseñar flujos de trabajo
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {processes.map((process) => {
            const statusCfg = STATUS_CONFIG[process.status];
            const StatusIcon = STATUS_ICONS[process.status];
            const nodesCount = Array.isArray(process.nodes)
              ? (process.nodes as unknown[]).length
              : 0;

            return (
              <div
                key={process.id}
                onClick={() => router.push(`/dashboard/processes/${process.id}`)}
                className="group flex cursor-pointer items-center gap-4 rounded-lg p-4 transition-all hover:border-[#3D7EFF40]"
                style={{ background: "#0E1220", border: "1px solid #1E2540" }}
              >
                {/* Icon */}
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "rgba(61,126,255,0.1)" }}
                >
                  <GitBranch className="h-5 w-5" style={{ color: "#3D7EFF" }} strokeWidth={1.75} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-sm font-medium" style={{ color: "#E2E8F8" }}>
                      {process.name}
                    </p>
                    <span
                      className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase"
                      style={{ background: statusCfg.bg, color: statusCfg.color }}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-4">
                    <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                      {process.category}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                      {nodesCount} nodos · v{process.version}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                      {formatDate(process.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {process.status === "active" && (
                    <button
                      onClick={(e) => handleStart(process.id, e)}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all"
                      style={{
                        background: "rgba(16,217,160,0.1)",
                        color: "#10D9A0",
                        border: "1px solid rgba(16,217,160,0.2)",
                      }}
                    >
                      <Play className="h-3 w-3" fill="currentColor" />
                      Iniciar
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/processes/${process.id}`);
                    }}
                    className="rounded p-1.5 transition-colors hover:bg-[#1E2540]"
                    style={{ color: "#7A8BAD" }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(process.id, e)}
                    className="rounded p-1.5 transition-colors hover:bg-[#F43F5E20]"
                    style={{ color: "#7A8BAD" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
