"use client";

// API Tokens — gestión desde Settings.
// Solo visible para users con settings.view (admin para crear/revocar).

import { useCallback, useEffect, useState } from "react";
import { Key, Plus, Trash2, Copy, Check, AlertCircle, ExternalLink } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface Token {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write" | "admin";
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export default function ApiTokensSection() {
  const { can, loading: permsLoading } = usePermissions();
  const canManage = can("settings", "manage");
  const canView = can("settings", "view");

  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<"read" | "write" | "admin">("read");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{ id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/api-tokens");
      if (r.ok) {
        const data = await r.json();
        setTokens(Array.isArray(data.tokens) ? data.tokens : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreatingBusy(true);
    try {
      const r = await fetch("/api/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scope: newScope }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: "Error" }));
        alert(data.error ?? "No se pudo crear");
        return;
      }
      const data = await r.json();
      setRevealedToken({ id: data.record.id, token: data.token });
      setNewName("");
      setCreating(false);
      await load();
    } finally {
      setCreatingBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("¿Revocar este token? Las apps que lo usan dejarán de funcionar.")) return;
    await fetch(`/api/api-tokens/${id}`, { method: "DELETE" });
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, revoked: true } : t)));
    if (revealedToken?.id === id) setRevealedToken(null);
  };

  const copyToken = (s: string) => {
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
            API Tokens
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--c-text-muted)" }}>
            Acceso programático a FlowOS desde apps externas, scripts, IAs (Claude, GPT, Gemini, Mistral, locales), automation tools (Make, n8n, Zapier).
            Base URL: <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}/api/v1</span>
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
            style={{ background: "var(--c-accent-blue)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo token
          </button>
        )}
      </div>

      {/* Form crear */}
      {creating && canManage && (
        <div
          className="mb-4 rounded-lg p-4"
          style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="mb-3 flex flex-col gap-3 sm:flex-row">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder='Nombre del token (ej "Integración Make")'
              className="flex-1 rounded px-3 py-2 text-sm outline-none"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            />
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as "read" | "write" | "admin")}
              className="rounded px-3 py-2 text-sm outline-none"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              <option value="read">Read · solo lectura</option>
              <option value="write">Write · puede crear</option>
              <option value="admin">Admin · todo</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="rounded px-3 py-1.5 text-xs" style={{ background: "var(--c-bg-elevated)", color: "var(--c-text-secondary)", border: "1px solid var(--c-border)" }}>
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={creatingBusy || !newName.trim()}
              className="rounded px-4 py-1.5 text-xs font-medium text-white"
              style={{ background: "var(--c-accent-blue)", opacity: creatingBusy || !newName.trim() ? 0.5 : 1 }}
            >
              {creatingBusy ? "Creando…" : "Crear token"}
            </button>
          </div>
        </div>
      )}

      {/* Token revelado one-time */}
      {revealedToken && (
        <div
          className="mb-4 rounded-lg p-4"
          style={{
            background: "rgb(var(--c-accent-amber-rgb) / 0.08)",
            border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.3)",
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" style={{ color: "var(--c-accent-amber)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--c-accent-amber)" }}>
              Guardá este token AHORA
            </p>
          </div>
          <p className="mb-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
            Solo se ve una vez. Después solo el prefix. Usalo en el header <span className="font-mono">Authorization: Bearer …</span>
          </p>
          <div className="flex gap-2">
            <code
              className="flex-1 rounded px-3 py-2 font-mono text-xs break-all"
              style={{ background: "var(--c-bg-base)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            >
              {revealedToken.token}
            </code>
            <button
              onClick={() => copyToken(revealedToken.token)}
              className="flex flex-shrink-0 items-center gap-1 rounded px-3 py-2 text-xs"
              style={{
                background: copied ? "var(--c-accent-emerald)" : "var(--c-bg-elevated)",
                color: copied ? "#fff" : "var(--c-text-primary)",
                border: "1px solid var(--c-border)",
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={() => setRevealedToken(null)}
              className="rounded px-3 py-2 text-xs"
              style={{ background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>Cargando…</p>
      ) : tokens.length === 0 ? (
        <div className="flo-empty-state">
          <Key size={28} strokeWidth={1.5} />
          <p className="flo-empty-state-title">Sin API tokens</p>
          <p className="flo-empty-state-desc">
            Creá tokens para conectar FlowOS con apps externas, IAs o scripts. Cada token tiene su propio scope (read / write / admin).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg p-3"
              style={{
                background: "var(--c-bg-surface)",
                border: "1px solid var(--c-border)",
                opacity: t.revoked ? 0.5 : 1,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: t.revoked ? "var(--c-bg-elevated)" : "rgb(var(--c-accent-violet-rgb) / 0.12)" }}
              >
                <Key className="h-4 w-4" style={{ color: t.revoked ? "var(--c-text-muted)" : "var(--c-accent-violet)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--c-text-primary)" }}>{t.name}</p>
                  <span className={`flo-chip ${
                    t.scope === "admin" ? "flo-chip-danger" :
                    t.scope === "write" ? "flo-chip-warning" :
                    "flo-chip-info"
                  }`}>
                    {t.scope}
                  </span>
                  {t.revoked && <span className="flo-chip flo-chip-muted">revoked</span>}
                </div>
                <p className="font-mono text-[11px]" style={{ color: "var(--c-text-muted)" }}>
                  {t.prefix} · creado {new Date(t.createdAt).toLocaleDateString("es-AR")}
                  {t.lastUsedAt && ` · último uso ${new Date(t.lastUsedAt).toLocaleDateString("es-AR")}`}
                </p>
              </div>
              {canManage && !t.revoked && (
                <button
                  onClick={() => revoke(t.id)}
                  className="rounded p-1.5"
                  title="Revocar token"
                  style={{ color: "var(--c-text-muted)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Docs quick reference */}
      <div
        className="mt-4 rounded-lg p-3 text-xs"
        style={{
          background: "var(--c-bg-elevated)",
          border: "1px solid var(--c-border)",
          color: "var(--c-text-secondary)",
        }}
      >
        <p className="mb-1 font-mono uppercase tracking-widest" style={{ color: "var(--c-text-muted)", fontSize: 10 }}>Quick start</p>
        <pre className="overflow-x-auto" style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "var(--c-text-primary)" }}>
{`curl ${typeof window !== "undefined" ? window.location.origin : "https://flowos-delta.vercel.app"}/api/v1/projects \\
  -H "Authorization: Bearer flo_<tu-token>"`}
        </pre>
        <p className="mt-2 flex items-center gap-1" style={{ color: "var(--c-text-muted)" }}>
          Endpoints disponibles: <span className="font-mono">/projects</span>, <span className="font-mono">/tasks</span>, <span className="font-mono">/employees</span>, <span className="font-mono">/orgchart</span>, <span className="font-mono">/processes</span>, <span className="font-mono">/processes/:id/start</span>
        </p>
        <p className="mt-2 flex items-center gap-1" style={{ color: "var(--c-text-muted)" }}>
          <ExternalLink size={10} /> Compatible con cualquier IA con tool use (Claude, GPT, Gemini, Mistral, Ollama) o automation tool (Make, n8n, Zapier).
        </p>
      </div>
    </section>
  );
}
