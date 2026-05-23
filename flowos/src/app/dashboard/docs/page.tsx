"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, Folder, FolderOpen, FileText, File, Image as ImageIcon,
  Table, FileCode, Trash2, Search, X, Download, Eye,
  EyeOff, ChevronRight, Plus, Loader2, Share2, LayoutGrid, List,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
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
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "#10D9A0" }} strokeWidth={1.75} />;
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 shrink-0" style={{ color: "#F43F5E" }} strokeWidth={1.75} />;
  if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.includes("csv"))
    return <Table className="h-4 w-4 shrink-0" style={{ color: "#10D9A0" }} strokeWidth={1.75} />;
  if (fileType.includes("word") || fileType.includes("document"))
    return <FileText className="h-4 w-4 shrink-0" style={{ color: "#3D7EFF" }} strokeWidth={1.75} />;
  if (fileType.includes("code") || fileType.includes("json") || fileType.includes("javascript"))
    return <FileCode className="h-4 w-4 shrink-0" style={{ color: "#A855F7" }} strokeWidth={1.75} />;
  return <File className="h-4 w-4 shrink-0" style={{ color: "#7A8BAD" }} strokeWidth={1.75} />;
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
    if (!confirm(`¿Eliminar este ${label}?`)) return;
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    if (selectedDoc?.id === doc.id) setSelectedDoc(null);
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
          style={{ border: "1px solid #1E2540" }}
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        {fileIcon(fileType)}
        <p className="text-sm" style={{ color: "#7A8BAD" }}>
          Vista previa no disponible para este tipo de archivo.
        </p>
        <button
          onClick={() => downloadDoc(doc)}
          className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all"
          style={{ background: "#3D7EFF", boxShadow: "0 0 12px rgba(61,126,255,0.3)" }}
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
      style={{ background: "#080B12" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Sidebar */}
      <aside
        className="flex w-60 flex-col flex-shrink-0"
        style={{ borderRight: "1px solid #1E2540", background: "#080B12" }}
      >
        {/* Búsqueda */}
        <div className="p-3" style={{ borderBottom: "1px solid #1E2540" }}>
          <div
            className="flex items-center gap-2 rounded px-2.5 py-1.5"
            style={{ background: "#0E1220", border: "1px solid #1E2540" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "#7A8BAD" }} strokeWidth={1.75} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "#E2E8F8" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "#7A8BAD" }}>
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
              style={{ background: "#3D7EFF", color: "#fff" }}
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" strokeWidth={2} />}
              Subir
            </button>
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs transition-colors hover:bg-[#141928]"
              style={{ border: "1px solid #1E2540", color: "#7A8BAD" }}
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
                style={{ background: "#0E1220", border: "1px solid #F59E0B40", color: "#E2E8F8" }}
              />
              <button onClick={createFolder} className="rounded px-2 py-1" style={{ background: "#F59E0B20", color: "#F59E0B" }}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Breadcrumb nav */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* Root */}
          {currentFolder !== null && !search && (
            <button
              onClick={() => setCurrentFolder(null)}
              className="mb-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs w-full text-left transition-colors hover:bg-[#141928]"
              style={{ color: "#7A8BAD" }}
            >
              ← Raíz
            </button>
          )}

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#3D7EFF" }} />
            </div>
          ) : (
            <>
              {/* Carpetas */}
              {folders.map((f) => (
                <div key={f.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => { setCurrentFolder(f.id); setSelectedDoc(null); setSearch(""); }}
                    className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-[#141928]"
                    style={{ color: "#C4CFEA" }}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: "#F59E0B" }} strokeWidth={1.75} />
                    <span className="truncate">{f.title}</span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => deleteDoc(f)}
                      title={`Eliminar carpeta "${f.title}"`}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#1E2540]"
                      style={{ color: "#7A8BAD" }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* Archivos */}
              {files.map((f) => {
                const fc = f.content as FileContent;
                return (
                  <div key={f.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => setSelectedDoc(f)}
                      className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
                      style={
                        selectedDoc?.id === f.id
                          ? { background: "rgba(61,126,255,0.12)", borderLeft: "2px solid #3D7EFF", color: "#E2E8F8", paddingLeft: "6px" }
                          : { color: "#7A8BAD" }
                      }
                    >
                      {fileIcon(fc.fileType)}
                      <span className="flex-1 truncate">{f.title}</span>
                      {fc.visibility === "admin_only" && (
                        <EyeOff className="h-3 w-3 shrink-0" style={{ color: "#F59E0B" }} strokeWidth={1.75} />
                      )}
                    </button>
                    <button
                      onClick={() => deleteDoc(f)}
                      title={`Eliminar "${f.title}"`}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#1E2540]"
                      style={{ color: "#7A8BAD" }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}

              {folders.length === 0 && files.length === 0 && !loading && (
                <p className="px-2 py-4 text-center text-xs" style={{ color: "#7A8BAD" }}>
                  {search ? "Sin resultados" : "Sin archivos aún"}
                </p>
              )}
            </>
          )}
        </nav>

        <div className="px-3 pb-2 font-mono text-[9px]" style={{ color: "#3A4560" }}>
          {files.length} archivo{files.length !== 1 ? "s" : ""} · {folders.length} carpeta{folders.length !== 1 ? "s" : ""}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar con breadcrumb */}
        <div
          className="flex items-center gap-2 px-6 py-3 text-sm"
          style={{ borderBottom: "1px solid #1E2540", color: "#7A8BAD" }}
        >
          <button onClick={() => { setCurrentFolder(null); setSelectedDoc(null); }} style={{ color: currentFolder ? "#7A8BAD" : "#E2E8F8" }}>
            Documentos
          </button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                onClick={() => { setCurrentFolder(b.id); setSelectedDoc(null); }}
                style={{ color: "#E2E8F8" }}
              >
                {b.title}
              </button>
            </span>
          ))}
          <div className="ml-auto flex gap-1" style={{ background: "#0E1220", border: "1px solid #1E2540", borderRadius: 6, padding: 2 }}>
            <button
              onClick={() => { setViewMode("list"); setSelectedDoc(null); }}
              title="Vista lista"
              style={{
                padding: "4px 7px", borderRadius: 4, border: "none", cursor: "pointer",
                background: viewMode === "list" ? "#1E2540" : "transparent",
                color: viewMode === "list" ? "#E2E8F8" : "#7A8BAD",
              }}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setViewMode("grid"); setSelectedDoc(null); }}
              title="Vista tarjetas"
              style={{
                padding: "4px 7px", borderRadius: 4, border: "none", cursor: "pointer",
                background: viewMode === "grid" ? "#1E2540" : "transparent",
                color: viewMode === "grid" ? "#E2E8F8" : "#7A8BAD",
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
            style={{ background: "rgba(61,126,255,0.1)", border: "2px dashed #3D7EFF" }}
          >
            <div className="text-center">
              <Upload className="mx-auto mb-2 h-8 w-8" style={{ color: "#3D7EFF" }} />
              <p className="text-sm font-medium" style={{ color: "#3D7EFF" }}>Soltá para subir</p>
            </div>
          </div>
        )}

        {viewMode === "grid" && !selectedDoc ? (
          /* Grid view */
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#3D7EFF" }} />
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="flex flex-col items-center gap-3 rounded-xl p-10" style={{ border: "2px dashed #1E2540" }}>
                  <Upload className="h-10 w-10" style={{ color: "#1E2540" }} strokeWidth={1} />
                  <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>Arrastrá archivos o hacé click para subir</p>
                  <p className="text-xs" style={{ color: "#7A8BAD" }}>Word, Excel, PDF, imágenes · Máximo 5 MB</p>
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
                      background: "#0E1220", border: "1px solid #1E2540", borderRadius: 10,
                      padding: 14, cursor: "pointer", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#F59E0B55")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E2540")}
                  >
                    <FolderOpen className="mb-3 h-9 w-9" style={{ color: "#F59E0B" }} strokeWidth={1.5} />
                    <p className="truncate text-xs font-medium" style={{ color: "#E2E8F8" }}>{f.title}</p>
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteDoc(f); }}
                        title={`Eliminar "${f.title}"`}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded p-1"
                        style={{ background: "rgba(244,63,94,0.1)", color: "#F43F5E" }}
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
                        background: "#0E1220", border: "1px solid #1E2540",
                        borderRadius: 10, padding: 14, cursor: "pointer", transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "#3D7EFF44")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E2540")}
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fc.storageUrl ?? fc.base64 ?? ""}
                          alt={f.title}
                          style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginBottom: 10 }}
                        />
                      ) : (
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "#141928" }}>
                          {fileIcon(fc.fileType)}
                        </div>
                      )}
                      <p className="truncate text-xs font-medium" style={{ color: "#E2E8F8" }}>{f.title}</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "#7A8BAD" }}>{formatSize(fc.fileSize)}</p>
                      {fc.visibility === "admin_only" && (
                        <EyeOff className="absolute top-2 left-2 h-3 w-3" style={{ color: "#F59E0B" }} />
                      )}
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteDoc(f); }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded p-1"
                          style={{ background: "rgba(244,63,94,0.1)", color: "#F43F5E" }}
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
              style={{ borderBottom: "1px solid #1E2540" }}
            >
              <div className="flex items-center gap-3">
                {selectedDoc.content.type === "file" && fileIcon((selectedDoc.content as FileContent).fileType)}
                <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>{selectedDoc.title}</p>
                {selectedDoc.content.type === "file" && (
                  <span className="font-mono text-[10px]" style={{ color: "#7A8BAD" }}>
                    {formatSize((selectedDoc.content as FileContent).fileSize)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && selectedDoc.content.type === "file" && (
                  <button
                    onClick={() => setSharingDoc(selectedDoc)}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors hover:bg-[#141928]"
                    style={{ border: "1px solid #1E2540", color: "#7A8BAD" }}
                  >
                    <Share2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Compartir
                  </button>
                )}
                {isAdmin && selectedDoc.content.type === "file" && (
                  <button
                    onClick={() => toggleVisibility(selectedDoc)}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors hover:bg-[#141928]"
                    style={{
                      border: "1px solid #1E2540",
                      color: (selectedDoc.content as FileContent).visibility === "admin_only" ? "#F59E0B" : "#7A8BAD",
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
                    style={{ background: "#3D7EFF", color: "#fff" }}
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                    Descargar
                  </button>
                )}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="rounded p-1.5 transition-colors hover:bg-[#141928]"
                  style={{ color: "#7A8BAD" }}
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
          /* Drop / empty state */
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              className="flex flex-col items-center gap-3 rounded-xl p-10"
              style={{ border: "2px dashed #1E2540" }}
            >
              <Upload className="h-10 w-10" style={{ color: "#1E2540" }} strokeWidth={1} />
              <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>
                Arrastrá archivos o hacé click para subir
              </p>
              <p className="text-xs" style={{ color: "#7A8BAD" }}>
                Word, Excel, PDF, imágenes, PSD y más · Máximo 5 MB por archivo
              </p>
            </div>
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
