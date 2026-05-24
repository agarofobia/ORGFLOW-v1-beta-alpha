"use client";

// Toggle personal del chat AI. Cada user puede ocultar/mostrar el botón
// flotante. Persiste en localStorage ("flowos-ai-hidden") — la misma flag
// que usa el chat widget para esconderse.
//
// Visible para cualquier user con permission ai.view (los que pueden usar
// el chat). NO requiere ai.manage como el AiConfigSection.

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const STORAGE_KEY = "flowos-ai-hidden";

export default function AiVisibilityToggle() {
  const { can, loading } = usePermissions();
  const canSeeChat = can("ai", "view");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    try {
      if (hidden) {
        localStorage.removeItem(STORAGE_KEY);
        setHidden(false);
      } else {
        localStorage.setItem(STORAGE_KEY, "true");
        setHidden(true);
      }
      // Avisar al widget para que se re-renderice (en el caso de que sea otro tab)
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    } catch {}
  }, [hidden]);

  if (loading) return null;
  if (!canSeeChat) return null;

  return (
    <section className="mt-6">
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{
                background: hidden
                  ? "rgb(var(--c-accent-amber-rgb) / 0.12)"
                  : "rgb(var(--c-accent-emerald-rgb) / 0.12)",
              }}
            >
              {hidden ? (
                <EyeOff className="h-4 w-4" style={{ color: "var(--c-accent-amber)" }} strokeWidth={1.75} />
              ) : (
                <Eye className="h-4 w-4" style={{ color: "var(--c-accent-emerald)" }} strokeWidth={1.75} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
                Chat del asistente IA
              </p>
              <p className="text-xs" style={{ color: "var(--c-text-muted)" }}>
                {hidden
                  ? "Está oculto para vos. Restaurarlo no afecta a otros usuarios."
                  : "Visible para vos como botón flotante abajo a la derecha."}
              </p>
            </div>
          </div>
          <button
            onClick={toggle}
            className="flex flex-shrink-0 items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: hidden ? "var(--c-accent-blue)" : "var(--c-bg-elevated)",
              border: hidden ? "none" : "1px solid var(--c-border)",
              color: hidden ? "#fff" : "var(--c-text-secondary)",
              cursor: "pointer",
            }}
          >
            {hidden ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                Mostrar
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Ocultar
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
