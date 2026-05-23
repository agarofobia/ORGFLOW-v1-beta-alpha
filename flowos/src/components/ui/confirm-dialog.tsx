"use client";

// <ConfirmDialog> + useConfirm() — reemplaza confirm() nativo.
// Promise-based, integrable con async/await como el confirm tradicional.
// Estilizado con la paleta dark de la app. Esc cancela, Enter confirma.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  description?: string;
  /** Texto del botón confirmar. Default "Confirmar". */
  confirmText?: string;
  /** Texto del botón cancelar. Default "Cancelar". */
  cancelText?: string;
  /** Si true (default), el botón confirmar es rojo (destructive). */
  danger?: boolean;
}

interface ConfirmCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<ConfirmCtx | null>(null);

interface PendingDialog extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus al confirmar al montar el diálogo
  useEffect(() => {
    if (pending) {
      setTimeout(() => confirmBtnRef.current?.focus(), 0);
    }
  }, [pending]);

  // Esc cancela, Enter confirma (cuando el focus está en el dialog)
  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        pending.resolve(false);
        setPending(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = (v: boolean) => {
    if (pending) {
      pending.resolve(v);
      setPending(null);
    }
  };

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div
          onClick={() => close(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 250,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            style={{
              width: "100%", maxWidth: 420,
              background: "#0E1220",
              border: "1px solid #1E2540",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: pending.danger !== false ? "rgba(244,63,94,0.12)" : "rgba(61,126,255,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle
                  style={{ width: 18, height: 18, color: pending.danger !== false ? "#F43F5E" : "#3D7EFF" }}
                  strokeWidth={2}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 id="confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#E2E8F8" }}>
                  {pending.title}
                </h2>
                {pending.description && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#7A8BAD", lineHeight: 1.5 }}>
                    {pending.description}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => close(false)}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 500,
                  background: "transparent",
                  border: "1px solid #1E2540",
                  borderRadius: 6, color: "#7A8BAD", cursor: "pointer",
                }}
              >
                {pending.cancelText ?? "Cancelar"}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => close(true)}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 600,
                  background: pending.danger !== false ? "#F43F5E" : "#3D7EFF",
                  border: "none",
                  borderRadius: 6, color: "#fff", cursor: "pointer",
                  boxShadow: pending.danger !== false
                    ? "0 0 12px rgba(244,63,94,0.4)"
                    : "0 0 12px rgba(61,126,255,0.4)",
                }}
              >
                {pending.confirmText ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmDialogProvider");
  return ctx.confirm;
}
