"use client";

// Sección para configurar el asistente IA — multi-provider.
// Solo visible para users con permission ai.manage.
// Soporta Anthropic (Claude), Google (Gemini), OpenAI (GPT), Mistral.
// El user elige el provider, pega su API key, y opcionalmente el modelo.

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff, Check, Loader2, Trash2, ExternalLink } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PROVIDER_CATALOG, type AiProvider, isValidProvider, getDefaultModelFor } from "@/lib/ai/providers";

interface AiConfigState {
  configured: boolean;
  enabled: boolean;
  provider: string;
  model: string;
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
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState<string>("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ai/config");
      if (r.ok) {
        const data = await r.json();
        setConfig(data);
        if (isValidProvider(data.provider)) {
          setProvider(data.provider);
        }
        setModel(data.model ?? getDefaultModelFor("anthropic"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cuando el user cambia provider en el dropdown, defaulteamos al modelo
  // recomendado de ese provider — salvo que el config actual ya use ese provider.
  const onProviderChange = (p: AiProvider) => {
    setProvider(p);
    if (config?.provider !== p) {
      setModel(getDefaultModelFor(p));
    }
  };

  const save = async (overrides: Partial<{ apiKey: string; enabled: boolean; model: string; provider: AiProvider }> = {}) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { provider, model };
      if ("apiKey" in overrides) body.apiKey = overrides.apiKey;
      else if (apiKey.trim()) body.apiKey = apiKey.trim();
      if ("enabled" in overrides) body.enabled = overrides.enabled;
      if ("provider" in overrides) body.provider = overrides.provider;
      if ("model" in overrides) body.model = overrides.model;
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

  if (!canManage) return null;

  const catalog = PROVIDER_CATALOG[provider];
  const configuredProvider = isValidProvider(config?.provider ?? "") ? (config!.provider as AiProvider) : null;
  const configuredCatalog = configuredProvider ? PROVIDER_CATALOG[configuredProvider] : null;

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
          Trae tu propia API key del proveedor de IA que prefieras. FlowOS no cobra por el uso del modelo — pagás directo al proveedor. La key se guarda encriptada con AES-256-GCM y nunca se devuelve al cliente.
        </p>
      </div>

      <div
        className="rounded-lg p-5"
        style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
      >
        {/* Status row */}
        <div className="mb-5 flex items-center justify-between">
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
                {config?.configured
                  ? `Configurado: ${configuredCatalog?.label ?? config.provider}`
                  : "Sin configurar"}
              </p>
              <p className="font-mono text-[11px]" style={{ color: "var(--c-text-muted)" }}>
                {config?.preview ?? "Sin API key"} · {config?.model ?? "—"}
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

        {/* Provider selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
            Proveedor
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["anthropic", "google", "openai", "mistral"] as const).map((p) => {
              const c = PROVIDER_CATALOG[p];
              const active = provider === p;
              return (
                <button
                  key={p}
                  onClick={() => onProviderChange(p)}
                  className="rounded p-2 text-left transition-all"
                  style={{
                    background: active ? "rgb(var(--c-accent-blue-rgb) / 0.12)" : "var(--c-bg-elevated)",
                    border: `1px solid ${active ? "rgb(var(--c-accent-blue-rgb) / 0.4)" : "var(--c-border)"}`,
                    color: active ? "var(--c-accent-blue)" : "var(--c-text-secondary)",
                  }}
                >
                  <p className="text-xs font-semibold">{c.label.split(" ")[0]}</p>
                  <p className="font-mono text-[9px] opacity-70">
                    {c.label.split(" ").slice(1).join(" ").replace(/[()]/g, "")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* API key input — placeholder + help URL cambian según provider */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
            {config?.configured && configuredProvider === provider ? "Reemplazar API key" : "API key"}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={catalog.keyPlaceholder}
                className="w-full rounded px-3 py-2 pr-10 font-mono text-xs outline-none"
                style={{
                  background: "var(--c-bg-elevated)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-primary)",
                }}
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
              style={{
                background: "var(--c-accent-blue)",
                opacity: saving || (!apiKey.trim() && !config?.configured) ? 0.5 : 1,
              }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {config?.configured ? "Actualizar" : "Guardar"}
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: "var(--c-text-muted)" }}>
            Generala en{" "}
            <a
              href={catalog.keyHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
              style={{ color: "var(--c-accent-blue)" }}
            >
              {catalog.keyHelpUrl.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3 w-3" />
            </a>
            {catalog.keyPrefix && <> · Debe empezar con <span className="font-mono">{catalog.keyPrefix}</span></>}
          </p>
        </div>

        {/* Model selector — opciones según provider */}
        <div className="mb-1">
          <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--c-text-secondary)" }}>
            Modelo
          </label>
          <select
            value={catalog.models.some((m) => m.id === model) ? model : catalog.defaultModel}
            onChange={(e) => {
              setModel(e.target.value);
              if (config?.configured) save({ model: e.target.value });
            }}
            className="w-full rounded px-3 py-2 text-xs outline-none"
            style={{
              background: "var(--c-bg-elevated)",
              border: "1px solid var(--c-border)",
              color: "var(--c-text-primary)",
            }}
          >
            {catalog.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {savedAt && Date.now() - savedAt < 3000 && (
          <p className="mt-3 text-xs" style={{ color: "var(--c-accent-emerald)" }}>
            ✓ Guardado
          </p>
        )}

        <div
          className="mt-5 rounded p-3 text-xs"
          style={{
            background: "rgb(var(--c-accent-amber-rgb) / 0.08)",
            border: "1px solid rgb(var(--c-accent-amber-rgb) / 0.2)",
            color: "#C4A672",
          }}
        >
          <strong>Importante:</strong> el asistente solo puede ver/crear cosas que el usuario que lo invoca pueda
          ver/crear (hereda permisos). Nunca puede eliminar registros.
          Quién ve el botón flotante: usuarios con <span className="font-mono">ai.view</span> y <span className="font-mono">ai.create</span>.
        </div>

        {provider === "google" && (
          <div
            className="mt-3 rounded p-3 text-xs"
            style={{
              background: "rgb(var(--c-accent-emerald-rgb) / 0.08)",
              border: "1px solid rgb(var(--c-accent-emerald-rgb) / 0.2)",
              color: "var(--c-accent-emerald)",
            }}
          >
            <strong>💡 Tip:</strong> Gemini 2.5 Flash tiene un tier <strong>gratuito</strong> de 1,500 requests/día. Para la mayoría de orgs alcanza sin pagar nada.
          </div>
        )}
      </div>
    </section>
  );
}
