"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
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
  Search,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  MoveRight,
} from "lucide-react";
import type { ProcessDefinition } from "@/db/schema";
import { useConfirm } from "@/components/ui/confirm-dialog";

const STATUS_CONFIG = {
  draft: { label: "Borrador", color: "var(--c-text-muted)", bg: "rgba(122,139,173,0.12)" },
  active: { label: "Activo", color: "var(--c-accent-emerald)", bg: "rgb(var(--c-accent-emerald-rgb) / 0.12)" },
  archived: { label: "Archivado", color: "var(--c-accent-amber)", bg: "rgb(var(--c-accent-amber-rgb) / 0.12)" },
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

type BreadcrumbEntry = { id: string; name: string };

export default function ProcessesPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<ProcessDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [search, setSearch] = useState("");
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  // Move-to-folder modal
  const [movingProcess, setMovingProcess] = useState<ProcessDefinition | null>(null);
  const [allFolders, setAllFolders] = useState<ProcessDefinition[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const fetchItems = useCallback(async (folderId: string | null) => {
    setLoading(true);
    try {
      const url = folderId
        ? `/api/processes?parentId=${folderId}`
        : "/api/processes";
      const res = await fetch(url);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(currentFolderId); }, [fetchItems, currentFolderId]);

  const navigateIntoFolder = (folder: ProcessDefinition) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    setSearch("");
  };

  const navigateToBreadcrumb = (index: number) => {
    // index -1 = root
    if (index === -1) {
      setBreadcrumbs([]);
      setCurrentFolderId(null);
    } else {
      const entry = breadcrumbs[index];
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      setCurrentFolderId(entry.id);
    }
    setSearch("");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nuevo proceso",
          parentId: currentFolderId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/dashboard/processes/${data.id}`);
      } else {
        toast.error("No se pudo crear el proceso", data.error ?? JSON.stringify(data));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt("Nombre de la carpeta:");
    if (!name?.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isFolder: true,
          name: name.trim(),
          parentId: currentFolderId,
        }),
      });
      if (res.ok) {
        await fetchItems(currentFolderId);
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDuplicate = async (process: ProcessDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicating(process.id);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloneFrom: process.id, name: `${process.name} (copia)` }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/processes/${data.id}`);
      }
    } finally {
      setDuplicating(null);
    }
  };

  const handleDelete = async (item: ProcessDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFolder = item.category === "folder";
    const ok = await confirm({
      title: isFolder ? "¿Eliminar carpeta?" : "¿Eliminar proceso?",
      description: isFolder
        ? `Se eliminará "${item.name}" y todo su contenido. Esta acción no se puede deshacer.`
        : `Se eliminará "${item.name}". Las instancias en curso quedarán huérfanas.`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/processes/${item.id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((p) => p.id !== item.id));
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
      const detail = data.projectId
        ? "Proyecto auto-creado desde el template. Mirá /dashboard/projects."
        : `ID: ${String(data.instanceId).slice(0, 8)}`;
      toast.success("Instancia iniciada", detail);
    } else {
      toast.error("No se pudo iniciar", data.error);
    }
  };

  const openMoveModal = async (process: ProcessDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    setMovingProcess(process);
    setLoadingFolders(true);
    try {
      // fetch ALL items at root to find folders (simple approach — fetch root only)
      const res = await fetch("/api/processes");
      if (res.ok) {
        const all: ProcessDefinition[] = await res.json();
        setAllFolders(all.filter((p) => p.category === "folder" && p.id !== process.id));
      }
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleMoveTo = async (targetFolderId: string | null) => {
    if (!movingProcess) return;
    await fetch(`/api/processes/${movingProcess.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: targetFolderId }),
    });
    setItems((prev) => prev.filter((p) => p.id !== movingProcess.id));
    setMovingProcess(null);
  };

  const folders = items.filter((p) => p.category === "folder");
  const processes = items.filter((p) => p.category !== "folder");
  const filtered = [...folders, ...processes].filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
            BPM
          </p>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: "var(--c-text-primary)" }}>
            Procesos
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateFolder}
            disabled={creatingFolder}
            className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-all hover:-translate-y-px disabled:opacity-60"
            style={{
              background: "rgb(var(--c-accent-blue-rgb) / 0.08)",
              border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.2)",
              color: "var(--c-text-muted)",
            }}
          >
            {creatingFolder ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
            )}
            Nueva carpeta
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px disabled:opacity-60"
            style={{
              background: "var(--c-accent-blue)",
              boxShadow: "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.35)",
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
      </div>

      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-1">
        <button
          onClick={() => navigateToBreadcrumb(-1)}
          className="text-xs transition-colors hover:text-white"
          style={{ color: breadcrumbs.length === 0 ? "var(--c-text-primary)" : "var(--c-text-muted)" }}
        >
          Todos los procesos
        </button>
        {breadcrumbs.map((bc, i) => (
          <span key={bc.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" style={{ color: "var(--c-border)" }} />
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className="text-xs transition-colors hover:text-white"
              style={{ color: i === breadcrumbs.length - 1 ? "var(--c-text-primary)" : "var(--c-text-muted)" }}
            >
              {bc.name}
            </button>
          </span>
        ))}
      </div>

      {/* Search */}
      {items.length > 0 && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--c-text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-lg py-2 pl-9 pr-4 text-sm outline-none"
            style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg py-24"
          style={{ background: "var(--c-bg-surface)", border: "1px dashed var(--c-border)" }}
        >
          <GitBranch className="mb-4 h-10 w-10" style={{ color: "var(--c-border)" }} strokeWidth={1} />
          <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
            {search ? "Sin resultados" : "Carpeta vacía"}
          </p>
          {!search && (
            <p className="mt-1 text-xs" style={{ color: "var(--c-text-muted)" }}>
              Creá un proceso o subcarpeta aquí
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const isFolder = item.category === "folder";

            if (isFolder) {
              return (
                <div
                  key={item.id}
                  onClick={() => navigateIntoFolder(item)}
                  className="group flex cursor-pointer items-center gap-4 rounded-lg p-4 transition-all hover:border-[rgb(var(--c-accent-blue-rgb) / 0.25)]"
                  style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
                >
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.08)" }}
                  >
                    <Folder className="h-5 w-5" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                      {item.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                      Carpeta · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => handleDelete(item, e)}
                      className="rounded p-1.5 transition-colors hover:bg-[rgb(var(--c-accent-red-rgb) / 0.13)]"
                      style={{ color: "var(--c-text-muted)" }}
                      title="Eliminar carpeta"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--c-border)" }} />
                </div>
              );
            }

            const statusCfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft;
            const StatusIcon = STATUS_ICONS[item.status as keyof typeof STATUS_ICONS] ?? Clock;
            const nodesCount = Array.isArray(item.nodes) ? (item.nodes as unknown[]).length : 0;

            return (
              <div
                key={item.id}
                onClick={() => router.push(`/dashboard/processes/${item.id}`)}
                className="group flex cursor-pointer items-center gap-4 rounded-lg p-4 transition-all hover:border-[rgb(var(--c-accent-blue-rgb) / 0.25)]"
                style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
              >
                {/* Icon */}
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.1)" }}
                >
                  <GitBranch className="h-5 w-5" style={{ color: "var(--c-accent-blue)" }} strokeWidth={1.75} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                      {item.name}
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
                    <span className="font-mono text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                      {item.category}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                      {nodesCount} nodos · v{item.version}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {item.status === "active" && (
                    <button
                      onClick={(e) => handleStart(item.id, e)}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all"
                      style={{
                        background: "rgb(var(--c-accent-emerald-rgb) / 0.1)",
                        color: "var(--c-accent-emerald)",
                        border: "1px solid rgb(var(--c-accent-emerald-rgb) / 0.2)",
                      }}
                    >
                      <Play className="h-3 w-3" fill="currentColor" />
                      Iniciar
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/processes/${item.id}`);
                    }}
                    className="rounded p-1.5 transition-colors hover:bg-[var(--c-border)]"
                    style={{ color: "var(--c-text-muted)" }}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => openMoveModal(item, e)}
                    className="rounded p-1.5 transition-colors hover:bg-[var(--c-border)]"
                    style={{ color: "var(--c-text-muted)" }}
                    title="Mover a carpeta"
                  >
                    <MoveRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDuplicate(item, e)}
                    disabled={duplicating === item.id}
                    className="rounded p-1.5 transition-colors hover:bg-[var(--c-border)] disabled:opacity-50"
                    style={{ color: "var(--c-text-muted)" }}
                    title="Duplicar"
                  >
                    {duplicating === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={(e) => handleDelete(item, e)}
                    className="rounded p-1.5 transition-colors hover:bg-[rgb(var(--c-accent-red-rgb) / 0.13)]"
                    style={{ color: "var(--c-text-muted)" }}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Move to folder modal */}
      {movingProcess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "var(--c-shadow-strong)" }}
          onClick={() => setMovingProcess(null)}
        >
          <div
            className="w-80 rounded-xl p-5"
            style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>
              Mover "{movingProcess.name}"
            </p>
            {loadingFolders ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMoveTo(null)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--c-border)]"
                  style={{ color: "var(--c-text-primary)" }}
                >
                  <FolderOpen className="h-4 w-4" style={{ color: "var(--c-text-muted)" }} />
                  Raíz (sin carpeta)
                </button>
                {allFolders.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: "var(--c-text-muted)" }}>
                    No hay carpetas creadas todavía
                  </p>
                )}
                {allFolders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleMoveTo(f.id)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--c-border)]"
                    style={{ color: "var(--c-text-primary)" }}
                  >
                    <Folder className="h-4 w-4" style={{ color: "var(--c-accent-amber)" }} />
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setMovingProcess(null)}
              className="mt-4 w-full rounded-lg py-2 text-xs transition-colors hover:bg-[var(--c-border)]"
              style={{ color: "var(--c-text-muted)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
