"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, Folder, FolderOpen, FileText, File, Image as ImageIcon,
  Table, FileCode, Trash2, Search, X, Download, Eye,
  EyeOff, ChevronRight, ChevronDown, Plus, Loader2, Share2, LayoutGrid, List,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useOrganization } from "@clerk/nextjs";
import ShareModal from "./ShareModal";

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Visibility = "all" | "admin_only";

interface FileContent {
  type: "file";
  fileName: string;
  fileType: string;
  fileSize: number;
  storageUrl?: string;
  base64?: string; // legacy
  visibility: Visibility;
}

interface FolderContent {
  type: "folder";
}

type DocContent = FileContent | FolderContent;

interface Doc {
  id: string;
  organizationId: string;
  title: string;
  content: DocContent;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-emerald)" }} strokeWidth={1.75} />;
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-red)" }} strokeWidth={1.75} />;
  if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.includes("csv"))
    return <Table className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-emerald)" }} strokeWidth={1.75} />;
  if (fileType.includes("word") || fileType.includes("document"))
    return <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-blue)" }} strokeWidth={1.75} />;
  if (fileType.includes("code") || fileType.includes("json") || fileType.includes("javascript"))
    return <FileCode className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-violet)" }} strokeWidth={1.75} />;
  return <File className="h-4 w-4 shrink-0" style={{ color: "var(--c-text-muted)" }} strokeWidth={1.75} />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const confirm = useConfirm();
  const toast = useToast();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null); // null = root
  const [search, setSearch] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [sharingDoc, setSharingDoc] = useState<Doc | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  // Inline rename — guarda el id del doc en edición + valor temp
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Tree view en sidebar: carpetas expandidas. Persiste entre renders pero no entre sesiones.
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── API ──────────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocs(data);
      } else {
        console.error("Docs API error:", data);
        setDocs([]);
      }
    } catch (err) {
      console.error("Docs fetch failed:", err);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Esc cierra el preview del archivo seleccionado
  useEffect(() => {
    if (!selectedDoc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedDoc(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDoc]);

  const uploadFile = async (file: File) => {
    if (file.size > MAX_SIZE) {
      toast.warning(`"${file.name}" supera 5 MB`, "Para archivos grandes, subí el link de Google Drive o Dropbox.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "org-files");

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");
      const { url: storageUrl } = await uploadRes.json();

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name,
          parentId: currentFolder,
          content: {
            type: "file",
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileSize: file.size,
            storageUrl,
            visibility: "all",
          } satisfies FileContent,
        }),
      });
      const doc = await res.json();
      if (doc?.id) {
        setDocs((prev) => [doc, ...prev]);
      } else {
        toast.error(`No se pudo subir "${file.name}"`, doc?.error ?? "respuesta inválida");
      }
    } catch (err) {
      toast.error("Error al subir", String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newFolderName.trim(),
        parentId: currentFolder,
        content: { type: "folder" } satisfies FolderContent,
      }),
    });
    const doc = await res.json();
    if (doc?.id) {
      setDocs((prev) => [doc, ...prev]);
    } else {
      toast.error("No se pudo crear la carpeta", doc?.error ?? "respuesta inválida");
    }
    setNewFolderName("");
    setCreatingFolder(false);
  };

  const deleteDoc = async (doc: Doc) => {
    const label = doc.content.type === "folder" ? "carpeta" : "archivo";
    const ok = await confirm({
      title: `¿Eliminar ${label}?`,
      description: doc.content.type === "folder"
        ? `Se eliminará "${doc.title}" y todo su contenido. Esta acción no se puede deshacer.`
        : `Se eliminará "${doc.title}". Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    if (selectedDoc?.id === doc.id) setSelectedDoc(null);
  };

  // Inline rename — comparte UX entre file y folder. Doble-click sobre el título
  // inicia la edición; Enter guarda; Esc cancela.
  const startRename = (doc: Doc) => {
    setRenamingId(doc.id);
    setRenameValue(doc.title);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };
  const commitRename = async (doc: Doc) => {
    const newTitle = renameValue.trim();
    if (!newTitle || newTitle === doc.title) { cancelRename(); return; }
    // Update optimista; el server confirma
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: newTitle } : d));
    setRenamingId(null);
    setRenameValue("");
    try {
      await fetch(`/api/documents/${doc.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, content: doc.content }),
      });
    } catch {
      // Si falla, revertir
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: doc.title } : d));
      toast.error("No se pudo renombrar", "Revisá tu conexión y reintentá.");
    }
  };

  const toggleVisibility = async (doc: Doc) => {
    if (doc.content.type !== "file") return;
    const newVis: Visibility = doc.content.visibility === "all" ? "admin_only" : "all";
    const newContent = { ...doc.content, visibility: newVis };
    await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: doc.title, content: newContent }),
    });
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, content: newContent } : d));
    if (selectedDoc?.id === doc.id) setSelectedDoc({ ...doc, content: newContent });
  };

  const downloadDoc = (doc: Doc) => {
    if (doc.content.type !== "file") return;
    const a = document.createElement("a");
    a.href = doc.content.storageUrl ?? doc.content.base64 ?? "";
    a.download = doc.content.fileName;
    a.target = "_blank";
    a.click();
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const visibleDocs = docs.filter((d) => {
    if (d.content.type === "file" && d.content.visibility === "admin_only" && !isAdmin) return false;
    if (search.trim()) return d.title.toLowerCase().includes(search.toLowerCase());
    return d.parentId === currentFolder;
  });

  const folders = visibleDocs.filter((d) => d.content.type === "folder");
  const files = visibleDocs.filter((d) => d.content.type === "file") as Doc[];

  // Breadcrumb path
  const buildPath = (folderId: string | null): Doc[] => {
    if (!folderId) return [];
    const folder = docs.find((d) => d.id === folderId);
    if (!folder) return [];
    return [...buildPath(folder.parentId), folder];
  };
  const breadcrumb = buildPath(currentFolder);

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Preview ──────────────────────────────────────────────────────────────
  function FilePreview({ doc }: { doc: Doc }) {
    if (doc.content.type !== "file") return null;
    const { fileType, storageUrl, base64, fileName } = doc.content;
    const src = storageUrl ?? base64 ?? "";
    if (fileType.startsWith("image/")) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={fileName} className="max-h-96 w-full object-contain rounded-lg" />;
    }
    if (fileType === "application/pdf") {
      return (
        <iframe
          src={src}
          title={fileName}
          className="h-96 w-full rounded-lg"
          style={{ border: "1px solid var(--c-border)" }}
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        {fileIcon(fileType)}
        <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>
          Vista previa no disponible para este tipo de archivo.
        </p>
        <button
          onClick={() => downloadDoc(doc)}
          className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all"
          style={{ background: "var(--c-accent-blue)", boxShadow: "0 0 12px rgb(var(--c-accent-blue-rgb) / 0.3)" }}
        >
          <Download className="h-4 w-4" strokeWidth={2} />
          Descargar
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full"
      style={{ background: "var(--c-bg-base)" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Sidebar */}
      <aside
        className="flex w-60 flex-col flex-shrink-0"
        style={{ borderRight: "1px solid var(--c-border)", background: "var(--c-bg-base)" }}
      >
        {/* Búsqueda */}
        <div className="p-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <div
            className="flex items-center gap-2 rounded px-2.5 py-1.5"
            style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-text-muted)" }} strokeWidth={1.75} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--c-text-primary)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "var(--c-text-muted)" }}>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors"
              style={{ background: "var(--c-accent-blue)", color: "#fff" }}
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" strokeWidth={2} />}
              Subir
            </button>
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs transition-colors hover:bg-[var(--c-bg-elevated)]"
              style={{ border: "1px solid var(--c-border)", color: "var(--c-text-muted)" }}
            >
              <Folder className="h-3 w-3" strokeWidth={1.75} />
              Carpeta
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Nueva carpeta */}
          {creatingFolder && (
            <div className="mt-2 flex gap-1.5">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
                placeholder="Nombre…"
                className="flex-1 rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.25)", color: "var(--c-text-primary)" }}
              />
              <button onClick={createFolder} className="rounded px-2 py-1" style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.13)", color: "var(--c-accent-amber)" }}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tree nav — jerarquía completa con folders expandibles */}
        <nav className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
            </div>
          ) : search.trim() ? (
            // Búsqueda activa → resultado flat sin tree (más útil)
            (() => {
              const matches = docs.filter(d => {
                if (d.content.type === "file" && d.content.visibility === "admin_only" && !isAdmin) return false;
                return d.title.toLowerCase().includes(search.toLowerCase());
              });
              if (matches.length === 0) {
                return <p className="px-2 py-4 text-center text-xs" style={{ color: "var(--c-text-muted)" }}>Sin resultados</p>;
              }
              return matches.map(d => (
                <TreeNode
                  key={d.id}
                  doc={d}
                  depth={0}
                  allDocs={docs}
                  isAdmin={isAdmin}
                  selectedDoc={selectedDoc}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  setSelectedDoc={setSelectedDoc}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  startRename={startRename}
                  cancelRename={cancelRename}
                  commitRename={commitRename}
                  deleteDoc={deleteDoc}
                  hideChildrenInSearch
                />
              ));
            })()
          ) : (() => {
            // Vista normal: árbol jerárquico desde la raíz
            const rootDocs = docs.filter(d => {
              if (d.content.type === "file" && d.content.visibility === "admin_only" && !isAdmin) return false;
              return d.parentId === null;
            });
            if (rootDocs.length === 0) {
              return <p className="px-2 py-4 text-center text-xs" style={{ color: "var(--c-text-muted)" }}>Sin archivos aún</p>;
            }
            // Ordenamos: carpetas primero (alfabético) + archivos después (alfabético)
            const sorted = [
              ...rootDocs.filter(d => d.content.type === "folder").sort((a, b) => a.title.localeCompare(b.title)),
              ...rootDocs.filter(d => d.content.type === "file").sort((a, b) => a.title.localeCompare(b.title)),
            ];
            return sorted.map(d => (
              <TreeNode
                key={d.id}
                doc={d}
                depth={0}
                allDocs={docs}
                isAdmin={isAdmin}
                selectedDoc={selectedDoc}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                setSelectedDoc={setSelectedDoc}
                renamingId={renamingId}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                startRename={startRename}
                cancelRename={cancelRename}
                commitRename={commitRename}
                deleteDoc={deleteDoc}
              />
            ));
          })()}
        </nav>

        <div className="px-3 pb-2 font-mono text-[9px]" style={{ color: "var(--c-text-placeholder)" }}>
          {files.length} archivo{files.length !== 1 ? "s" : ""} · {folders.length} carpeta{folders.length !== 1 ? "s" : ""}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar con breadcrumb */}
        <div
          className="flex items-center gap-2 px-6 py-3 text-sm"
          style={{ borderBottom: "1px solid var(--c-border)", color: "var(--c-text-muted)" }}
        >
          <button onClick={() => { setCurrentFolder(null); setSelectedDoc(null); }} style={{ color: currentFolder ? "var(--c-text-muted)" : "var(--c-text-primary)" }}>
            Documentos
          </button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                onClick={() => { setCurrentFolder(b.id); setSelectedDoc(null); }}
                style={{ color: "var(--c-text-primary)" }}
              >
                {b.title}
              </button>
            </span>
          ))}
          <div className="ml-auto flex gap-1" style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 6, padding: 2 }}>
            <button
              onClick={() => { setViewMode("list"); setSelectedDoc(null); }}
              title="Vista lista"
              style={{
                padding: "4px 7px", borderRadius: 4, border: "none", cursor: "pointer",
                background: viewMode === "list" ? "var(--c-border)" : "transparent",
                color: viewMode === "list" ? "var(--c-text-primary)" : "var(--c-text-muted)",
              }}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setViewMode("grid"); setSelectedDoc(null); }}
              title="Vista tarjetas"
              style={{
                padding: "4px 7px", borderRadius: 4, border: "none", cursor: "pointer",
                background: viewMode === "grid" ? "var(--c-border)" : "transparent",
                color: viewMode === "grid" ? "var(--c-text-primary)" : "var(--c-text-muted)",
              }}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Drop zone highlight */}
        {dragOver && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.1)", border: "2px dashed var(--c-accent-blue)" }}
          >
            <div className="text-center">
              <Upload className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--c-accent-blue)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--c-accent-blue)" }}>Soltá para subir</p>
            </div>
          </div>
        )}

        {viewMode === "grid" && !selectedDoc ? (
          /* Grid view */
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="flex flex-col items-center gap-3 rounded-xl p-10" style={{ border: "2px dashed var(--c-border)" }}>
                  <Upload className="h-10 w-10" style={{ color: "var(--c-border)" }} strokeWidth={1} />
                  <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>Arrastrá archivos o hacé click para subir</p>
                  <p className="text-xs" style={{ color: "var(--c-text-muted)" }}>Word, Excel, PDF, imágenes · Máximo 5 MB</p>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                {/* Carpetas */}
                {folders.map(f => (
                  <div
                    key={f.id}
                    className="group relative"
                    onDoubleClick={() => { setCurrentFolder(f.id); setSelectedDoc(null); setSearch(""); }}
                    style={{
                      background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 10,
                      padding: 14, cursor: "pointer", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgb(var(--c-accent-amber-rgb) / 0.33)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--c-border)")}
                  >
                    <FolderOpen className="mb-3 h-9 w-9" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.5} />
                    <p className="truncate text-xs font-medium" style={{ color: "var(--c-text-primary)" }}>{f.title}</p>
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteDoc(f); }}
                        title={`Eliminar "${f.title}"`}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded p-1"
                        style={{ background: "rgb(var(--c-accent-red-rgb) / 0.1)", color: "var(--c-accent-red)" }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {/* Archivos */}
                {files.map((rawFile) => {
                  const f = rawFile as Doc;
                  const fc = f.content as FileContent;
                  const isImage = fc.fileType.startsWith("image/");
                  return (
                    <div
                      key={f.id}
                      className="group relative"
                      onClick={() => setSelectedDoc(f)}
                      style={{
                        background: "var(--c-bg-surface)", border: "1px solid var(--c-border)",
                        borderRadius: 10, padding: 14, cursor: "pointer", transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgb(var(--c-accent-blue-rgb) / 0.27)")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--c-border)")}
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fc.storageUrl ?? fc.base64 ?? ""}
                          alt={f.title}
                          style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginBottom: 10 }}
                        />
                      ) : (
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--c-bg-elevated)" }}>
                          {fileIcon(fc.fileType)}
                        </div>
                      )}
                      <p className="truncate text-xs font-medium" style={{ color: "var(--c-text-primary)" }}>{f.title}</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--c-text-muted)" }}>{formatSize(fc.fileSize)}</p>
                      {fc.visibility === "admin_only" && (
                        <EyeOff className="absolute top-2 left-2 h-3 w-3" style={{ color: "var(--c-accent-amber)" }} />
                      )}
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteDoc(f); }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded p-1"
                          style={{ background: "rgb(var(--c-accent-red-rgb) / 0.1)", color: "var(--c-accent-red)" }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : selectedDoc ? (
          /* Preview panel */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-6 py-3"
              style={{ borderBottom: "1px solid var(--c-border)" }}
            >
              <div className="flex items-center gap-3">
                {selectedDoc.content.type === "file" && fileIcon((selectedDoc.content as FileContent).fileType)}
                <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>{selectedDoc.title}</p>
                {selectedDoc.content.type === "file" && (
                  <span className="font-mono text-[10px]" style={{ color: "var(--c-text-muted)" }}>
                    {formatSize((selectedDoc.content as FileContent).fileSize)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && selectedDoc.content.type === "file" && (
                  <button
                    onClick={() => setSharingDoc(selectedDoc)}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors hover:bg-[var(--c-bg-elevated)]"
                    style={{ border: "1px solid var(--c-border)", color: "var(--c-text-muted)" }}
                  >
                    <Share2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Compartir
                  </button>
                )}
                {isAdmin && selectedDoc.content.type === "file" && (
                  <button
                    onClick={() => toggleVisibility(selectedDoc)}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors hover:bg-[var(--c-bg-elevated)]"
                    style={{
                      border: "1px solid var(--c-border)",
                      color: (selectedDoc.content as FileContent).visibility === "admin_only" ? "var(--c-accent-amber)" : "var(--c-text-muted)",
                    }}
                  >
                    {(selectedDoc.content as FileContent).visibility === "admin_only"
                      ? <><EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> Solo admins</>
                      : <><Eye className="h-3.5 w-3.5" strokeWidth={1.75} /> Todos</>
                    }
                  </button>
                )}
                {selectedDoc.content.type === "file" && (
                  <button
                    onClick={() => downloadDoc(selectedDoc)}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors"
                    style={{ background: "var(--c-accent-blue)", color: "#fff" }}
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                    Descargar
                  </button>
                )}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="rounded p-1.5 transition-colors hover:bg-[var(--c-bg-elevated)]"
                  style={{ color: "var(--c-text-muted)" }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <FilePreview doc={selectedDoc} />
            </div>
          </div>
        ) : (
          /* List view — filas con folders + files del current folder */
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--c-accent-blue)" }} />
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              /* Empty: dropzone clickable */
              <div
                className="flex flex-1 flex-col items-center justify-center gap-4 cursor-pointer py-16"
                onClick={() => fileInputRef.current?.click()}
              >
                <div
                  className="flex flex-col items-center gap-3 rounded-xl p-10"
                  style={{ border: "2px dashed var(--c-border)" }}
                >
                  <Upload className="h-10 w-10" style={{ color: "var(--c-border)" }} strokeWidth={1} />
                  <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                    Arrastrá archivos o hacé click para subir
                  </p>
                  <p className="text-xs" style={{ color: "var(--c-text-muted)" }}>
                    Word, Excel, PDF, imágenes, PSD y más · Máximo 5 MB por archivo
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Header de columnas */}
                <div
                  className="grid items-center px-6 py-2 text-[10px] font-mono uppercase tracking-widest"
                  style={{
                    gridTemplateColumns: "1fr 110px 110px 40px",
                    color: "var(--c-text-muted)",
                    borderBottom: "1px solid var(--c-border)",
                  }}
                >
                  <span>Nombre</span>
                  <span className="text-right">Tamaño</span>
                  <span className="text-right">Visibilidad</span>
                  <span></span>
                </div>

                {/* Carpetas */}
                {folders.map((f) => (
                  <div
                    key={f.id}
                    className="group grid items-center px-6 py-2.5 text-xs transition-colors hover:bg-[var(--c-bg-elevated)] cursor-pointer"
                    style={{
                      gridTemplateColumns: "1fr 110px 110px 40px",
                      borderBottom: "1px solid rgb(var(--c-border-rgb) / 0.25)",
                    }}
                    onClick={() => { setCurrentFolder(f.id); setSelectedDoc(null); setSearch(""); }}
                    onDoubleClick={() => isAdmin && startRename(f)}
                    title={isAdmin ? "Click: abrir · Doble-click: renombrar" : "Click: abrir"}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FolderOpen className="h-4 w-4 shrink-0" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />
                      <span className="truncate" style={{ color: "var(--c-text-primary)" }}>{f.title}</span>
                    </div>
                    <span className="text-right" style={{ color: "var(--c-text-muted)" }}>—</span>
                    <span className="text-right" style={{ color: "var(--c-text-muted)" }}>—</span>
                    <div className="flex justify-end">
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteDoc(f); }}
                          title={`Eliminar carpeta "${f.title}"`}
                          className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-[var(--c-border)]"
                          style={{ color: "var(--c-accent-red)" }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Archivos */}
                {files.map((rawFile) => {
                  const f = rawFile as Doc;
                  const fc = f.content as FileContent;
                  return (
                    <div
                      key={f.id}
                      className="group grid items-center px-6 py-2.5 text-xs transition-colors hover:bg-[var(--c-bg-elevated)] cursor-pointer"
                      style={{
                        gridTemplateColumns: "1fr 110px 110px 40px",
                        borderBottom: "1px solid rgb(var(--c-border-rgb) / 0.25)",
                      }}
                      onClick={() => setSelectedDoc(f)}
                      onDoubleClick={() => isAdmin && startRename(f)}
                      title={isAdmin ? "Click: abrir preview · Doble-click: renombrar" : "Click: abrir preview"}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {fileIcon(fc.fileType)}
                        <span className="truncate" style={{ color: "var(--c-text-primary)" }}>{f.title}</span>
                      </div>
                      <span className="text-right font-mono" style={{ color: "var(--c-text-muted)" }}>
                        {formatSize(fc.fileSize)}
                      </span>
                      <div className="flex justify-end items-center gap-1.5" style={{ color: "var(--c-text-muted)" }}>
                        {fc.visibility === "admin_only" ? (
                          <>
                            <EyeOff className="h-3 w-3" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />
                            <span style={{ color: "var(--c-accent-amber)", fontSize: 10 }}>Admins</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3" strokeWidth={1.75} />
                            <span style={{ fontSize: 10 }}>Todos</span>
                          </>
                        )}
                      </div>
                      <div className="flex justify-end">
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteDoc(f); }}
                            title={`Eliminar "${f.title}"`}
                            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-[var(--c-border)]"
                            style={{ color: "var(--c-accent-red)" }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Drop zone más abajo, sutil */}
                <div
                  className="m-6 flex flex-col items-center justify-center gap-2 rounded-xl p-6 cursor-pointer transition-colors hover:bg-[var(--c-bg-surface)]"
                  style={{ border: "1px dashed var(--c-border)" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-5 w-5" style={{ color: "var(--c-border)" }} strokeWidth={1.5} />
                  <p className="text-xs" style={{ color: "var(--c-text-muted)" }}>
                    Arrastrá o hacé click para subir más archivos · Máximo 5 MB
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {sharingDoc && (
        <ShareModal
          documentId={sharingDoc.id}
          documentTitle={sharingDoc.title}
          onClose={() => setSharingDoc(null)}
        />
      )}
    </div>
  );
}

// ─── TreeNode recursivo ──────────────────────────────────────────────────────
// Renderiza un documento (file o folder) con indentación según depth.
// Si es folder y está expandido, renderiza sus hijos debajo.
// El padding-left aumenta 12px por nivel para mostrar la jerarquía visual.

interface TreeNodeProps {
  doc: Doc;
  depth: number;
  allDocs: Doc[];
  isAdmin: boolean;
  selectedDoc: Doc | null;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  setSelectedDoc: (d: Doc | null) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  startRename: (d: Doc) => void;
  cancelRename: () => void;
  commitRename: (d: Doc) => void;
  deleteDoc: (d: Doc) => void;
  // En modo búsqueda, no expandimos hijos automáticamente (los resultados ya están flat).
  hideChildrenInSearch?: boolean;
}

function TreeNode(props: TreeNodeProps) {
  const {
    doc, depth, allDocs, isAdmin, selectedDoc, expandedFolders, toggleFolder,
    setSelectedDoc, renamingId, renameValue, setRenameValue,
    startRename, cancelRename, commitRename, deleteDoc, hideChildrenInSearch,
  } = props;

  const isFolder = doc.content.type === "folder";
  const isExpanded = isFolder && expandedFolders.has(doc.id);
  const isSelected = !isFolder && selectedDoc?.id === doc.id;

  // Hijos directos del folder (si aplica)
  const children = isFolder
    ? allDocs.filter(d => {
        if (d.parentId !== doc.id) return false;
        // Ocultar admin-only para non-admins también dentro del tree
        if (d.content.type === "file" && d.content.visibility === "admin_only" && !isAdmin) return false;
        return true;
      })
    : [];
  const sortedChildren = [
    ...children.filter(d => d.content.type === "folder").sort((a, b) => a.title.localeCompare(b.title)),
    ...children.filter(d => d.content.type === "file").sort((a, b) => a.title.localeCompare(b.title)),
  ];

  // Padding-left por depth + espacio para el chevron (12px por nivel + 4px base)
  const indent = depth * 12 + 4;

  const fc = doc.content.type === "file" ? doc.content : null;

  return (
    <>
      <div
        className="group flex items-center gap-0.5"
        style={{ paddingLeft: indent }}
      >
        {/* Chevron expand/collapse — visible solo para folders. Para files: spacer del mismo ancho */}
        {isFolder ? (
          <button
            onClick={() => toggleFolder(doc.id)}
            className="flex h-5 w-4 shrink-0 items-center justify-center rounded hover:bg-[var(--c-border)]"
            style={{ color: "var(--c-text-muted)" }}
            aria-label={isExpanded ? "Colapsar carpeta" : "Expandir carpeta"}
          >
            {isExpanded
              ? <ChevronDown className="h-3 w-3" strokeWidth={2} />
              : <ChevronRight className="h-3 w-3" strokeWidth={2} />}
          </button>
        ) : (
          <span className="h-5 w-4 shrink-0" />
        )}

        {/* Rename mode */}
        {renamingId === doc.id ? (
          <div className="flex flex-1 items-center gap-2 rounded px-1 py-1.5">
            {isFolder
              ? <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />
              : fileIcon(fc!.fileType)}
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(doc); }
                if (e.key === "Escape") cancelRename();
              }}
              onBlur={() => commitRename(doc)}
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--c-text-primary)", borderBottom: "1px solid var(--c-accent-blue)" }}
            />
          </div>
        ) : (
          <button
            onClick={() => {
              if (isFolder) toggleFolder(doc.id);
              else setSelectedDoc(doc);
            }}
            onDoubleClick={() => isAdmin && startRename(doc)}
            title={isAdmin ? "Doble-click para renombrar" : undefined}
            className="flex flex-1 items-center gap-2 rounded px-1.5 py-1.5 text-xs transition-colors hover:bg-[var(--c-bg-elevated)]"
            style={
              isSelected
                ? { background: "rgb(var(--c-accent-blue-rgb) / 0.12)", borderLeft: "2px solid var(--c-accent-blue)", color: "var(--c-text-primary)", paddingLeft: "4px" }
                : { color: isFolder ? "var(--c-text-secondary)" : "var(--c-text-muted)" }
            }
          >
            {isFolder
              ? (isExpanded
                  ? <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />
                  : <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />)
              : fileIcon(fc!.fileType)}
            <span className="flex-1 truncate">{doc.title}</span>
            {!isFolder && fc?.visibility === "admin_only" && (
              <EyeOff className="h-3 w-3 shrink-0" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />
            )}
          </button>
        )}

        {/* Delete button — visible al hover */}
        {isAdmin && renamingId !== doc.id && (
          <button
            onClick={() => deleteDoc(doc)}
            title={`Eliminar ${isFolder ? "carpeta" : "archivo"} "${doc.title}"`}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--c-border)]"
            style={{ color: "var(--c-text-muted)" }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Hijos recursivos — solo si folder expandido y no estamos en modo búsqueda flat */}
      {isFolder && isExpanded && !hideChildrenInSearch && sortedChildren.length > 0 && (
        <>
          {sortedChildren.map(child => (
            <TreeNode {...props} key={child.id} doc={child} depth={depth + 1} />
          ))}
        </>
      )}
      {isFolder && isExpanded && !hideChildrenInSearch && sortedChildren.length === 0 && (
        <p
          className="text-[10px] italic"
          style={{ color: "var(--c-text-placeholder)", paddingLeft: indent + 24, paddingTop: 2, paddingBottom: 2 }}
        >
          (vacía)
        </p>
      )}
    </>
  );
}
