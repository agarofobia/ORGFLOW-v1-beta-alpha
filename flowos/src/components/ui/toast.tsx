"use client";

// Toast system minimalista — reemplaza alert() del browser por notificaciones inline.
// Uso:
//   import { useToast } from "@/components/ui/toast";
//   const toast = useToast();
//   toast.success("Guardado"); toast.error("Falló"); toast.info("Info");
//
// Mount: <ToastProvider> en el root del dashboard.

import { createContext, useCallback, useContext, useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  durationMs: number;
}

interface ToastAPI {
  show: (kind: ToastKind, title: string, body?: string, durationMs?: number) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback silencioso si se llama fuera del Provider (no crashear)
    return {
      show: () => {}, success: () => {}, error: () => {}, info: () => {}, warning: () => {},
    };
  }
  return ctx;
}

const KIND_META: Record<ToastKind, { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2, color: "var(--c-accent-emerald)", bg: "rgb(var(--c-accent-emerald-rgb) / 0.08)", border: "rgb(var(--c-accent-emerald-rgb) / 0.4)" },
  error:   { icon: AlertTriangle, color: "var(--c-accent-red)", bg: "rgb(var(--c-accent-red-rgb) / 0.08)", border: "rgb(var(--c-accent-red-rgb) / 0.4)" },
  info:    { icon: Info, color: "var(--c-accent-blue)", bg: "rgb(var(--c-accent-blue-rgb) / 0.08)", border: "rgb(var(--c-accent-blue-rgb) / 0.4)" },
  warning: { icon: AlertTriangle, color: "var(--c-accent-amber)", bg: "rgb(var(--c-accent-amber-rgb) / 0.08)", border: "rgb(var(--c-accent-amber-rgb) / 0.4)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((kind: ToastKind, title: string, body?: string, durationMs = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems(prev => [...prev, { id, kind, title, body, durationMs }]);
  }, []);

  const api: ToastAPI = {
    show,
    success: (t, b) => show("success", t, b),
    error: (t, b) => show("error", t, b, 6000),
    info: (t, b) => show("info", t, b),
    warning: (t, b) => show("warning", t, b, 5000),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Container — esquina inferior derecha, stack vertical */}
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 200,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      }}>
        {items.map(t => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setExiting(true), item.durationMs);
    return () => clearTimeout(id);
  }, [item.durationMs]);

  useEffect(() => {
    if (!exiting) return;
    const id = setTimeout(onDismiss, 250);
    return () => clearTimeout(id);
  }, [exiting, onDismiss]);

  return (
    <div style={{
      pointerEvents: "auto",
      minWidth: 280, maxWidth: 380,
      background: "var(--c-bg-surface)",
      border: `1px solid ${meta.border}`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 8,
      boxShadow: "0 8px 24px var(--c-shadow-medium)",
      padding: "10px 12px",
      display: "flex", alignItems: "flex-start", gap: 10,
      opacity: exiting ? 0 : 1,
      transform: exiting ? "translateX(20px)" : "translateX(0)",
      transition: "opacity 220ms ease, transform 220ms ease",
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: meta.bg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={13} style={{ color: meta.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", lineHeight: 1.3 }}>
          {item.title}
        </p>
        {item.body && (
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--c-text-muted)", lineHeight: 1.45 }}>
            {item.body}
          </p>
        )}
      </div>
      <button onClick={() => setExiting(true)}
        style={{ background: "transparent", border: "none", color: "var(--c-text-muted)", cursor: "pointer", padding: 2, flexShrink: 0 }}>
        <X size={12} />
      </button>
    </div>
  );
}
