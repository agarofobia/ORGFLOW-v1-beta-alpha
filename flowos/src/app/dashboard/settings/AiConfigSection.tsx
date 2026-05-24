"use client";

// Sección para configurar el asistente IA (Claude) — solo visible para users
// con permission ai.manage. El user pega su API key de Anthropic, decide si
// la feature está habilitada en la org, y opcionalmente cambia el modelo.

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff, Check, Loader2, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface AiConfigState {
  configured: boolean;
  enabled: boolean;
  model: string;
  provider: string;
  preview: string | null;
  updatedAt?: string;
}

export default function AiConfigSection() {
  const { can, loading: permsLoading } = usePermissions();
  const canManage = can("ai", "manage");

  const [config, setConfig] = useState<AiConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ai/config");
      if (r.ok) {
        const data = await r.json();
        setConfig(data);
        setModel(data.model ?? "claude-sonnet-4-6");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (overrides: Partial<{ apiKey: string; enabled: boolean; model: string }> = {}) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { model };
      if ("apiKey" in overrides) body.apiKey = overrides.apiKey;
      else if (apiKey.trim()) body.apiKey = apiKey.trim();
      if ("enabled" in overrides) body.enabled = overrides.enabled;
      const r = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: "Error desconocido" }));
        alert(data.error ?? "No se pudo guardar.");
        return;
      }
      setApiKey("");
      setSavedAt(Date.now());
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeConfig = async () => {
    if (!confirm("¿Eliminar la configuración del asistente IA? Los usuarios dejarán de ver el chat.")) return;
    setSaving(true);
    try {
      await fetch("/api/ai/config", { method: "DELETE" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (permsLoading || loading) {
    return (
      <section className="mt-12">
        <div className="flex items-center gap-2" style={{ color: "var(--c-text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando configuración IA…</span>
        </div>
      </section>
    );
  }

  if (!canManage) {
    return null; // No mostrar la sección si no tiene permission de admin sobre IA
  }

  return (
    <section className="mt-12">
      <div className="mb-5">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
          Asistente IA
        </p>
        <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--c-text-primary)" }}>
          Configurar asistente
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--c-text-muted)" }}>
          Trae tu propia API key de Anthropic (Claude). FlowOS no cobra por uso del modelo — pagás directo a Anthropic. La key se guarda encriptada con AES-256-GCM y nunca se devuelve al cliente.
        </p>
      </div>

      <div
        className="rounded-lg p-5"
        style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
      >
        {/* Status row */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: config?.configured ? "rgb(var(--c-accent-emerald-rgb) / 0.12)" : "rgba(122,139,173,0.12)",
              }}
            >
              <Sparkles
                className="h-4 w-4"
                style={{ color: config?.configured ? "var(--c-accent-emerald)" : "var(--c-text-muted)" }}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                {config?.configured ? "API key configurada" : "Sin API key"}
              </p>
              <p className="font-mono text-[11px]" style={{ color: "var(--c-text-muted)" }}>
                {config?.preview ?? "No configurada"} · {config?.model ?? "claude-sonnet-4-6"}
              </p>
            </div>
          </div>
          {config?.configured && (
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => save({ enabled: e.target.checked })}
                  disabled={saving}
                />
                Habilitado para la org
              </label>
              <button
                onClick={removeConfig}
                disabled={saving}
                title="Eliminar configuración"
                aria-label="Eliminar configuración"
                className="rounded p-1.5 transition-colors"
                style={{ color: "var(--c-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-accent-red)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* API key input */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
            {config?.configured ? "Reemplazar API key" : "API key de Anthropic"}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-…"
                className="w-full rounded px-3 py-2 pr-10 font-mono text-xs outline-none"
                style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                style={{ color: "var(--c-text-muted)" }}
                title={showKey ? "Ocultar" : "Mostrar"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={() => save()}
              disabled={saving || (!apiKey.trim() && !config?.configured)}
              className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all"
              style={{ background: "var(--c-accent-blue)", opacity: saving || (!apiKey.trim() && !config?.configured) ? 0.5 : 1 }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {config?.configured ? "Actualizar" : "Guardar"}
            </button>
          </div>
          <p className="mt-1.5 text-xs" style={{ color: "var(--c-text-muted)" }}>
            Generala en{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--c-accent-blue)" }}
            >
              console.anthropic.com/settings/keys
            </a>
            . Debe empezar con <span className="font-mono">sk-ant-</span>.
          </p>
        </div>

        {/* Model selector */}
        <div className="mb-1">
          <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
            Modelo
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => model !== config?.model && save()}
            className="w-full rounded px-3 py-2 text-xs outline-none"
            style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
          >
            <option value="claude-sonnet-4-6">Sonnet 4.6 (rápido, costo medio) — recomendado</option>
            <option value="claude-opus-4-7">Opus 4.7 (más potente, más caro)</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5 (más barato, menos contexto)</option>
          </select>
        </div>

        {savedAt && Date.now() - savedAt < 3000 && (
          <p className="mt-3 text-xs" style={{ color: "var(--c-accent-emerald)" }}>
            ✓ Guardado
          </p>
        )}

        <div
          className="mt-5 rounded p-3 text-xs"
          style={{ background: "rgb(var(--c-accent-amber-rgb) / 0.08)", border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.2)", color: "#C4A672" }}
        >
          <strong>Importante:</strong> el asistente solo puede ver/crear cosas que el usuario que lo invoca pueda
          ver/crear (hereda permisos). Nunca puede eliminar registros.
          Quién ve el botón flotante: usuarios con <span className="font-mono">ai.view</span> y <span className="font-mono">ai.create</span>.
        </div>
      </div>
    </section>
  );
}
