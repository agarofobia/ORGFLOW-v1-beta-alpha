"use client";

// Chat flotante con el asistente IA. Aparece solo si:
//  1. La feature está habilitada para la org (ai_config.enabled)
//  2. El user tiene permission ai.view + ai.create
//  3. El user no lo desactivó manualmente (localStorage "flowos-ai-hidden")

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, EyeOff, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePermissions } from "@/hooks/usePermissions";
import { PROVIDER_CATALOG, isValidProvider, type AiProvider } from "@/lib/ai/providers";

// ─── Types ───────────────────────────────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

const HIDDEN_LS_KEY = "flowos-ai-hidden";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMessageText(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function getToolUses(msg: ChatMessage): string[] {
  if (typeof msg.content === "string") return [];
  return msg.content
    .filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use")
    .map((b) => b.name);
}

function isVisibleMessage(msg: ChatMessage): boolean {
  if (msg.role === "user" && typeof msg.content === "string") return true;
  if (msg.role === "assistant" && getMessageText(msg).trim().length > 0) return true;
  return false;
}

// Tools tienen nombres tipo `list_employees` — los mostramos prettier.
function prettyToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^Get /, "Leyendo ")
    .replace(/^List /, "Listando ")
    .replace(/^Create /, "Creando ")
    .replace(/^Find /, "Buscando ");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AiChatWidget() {
  const { can, loading: permsLoading } = usePermissions();
  const [enabledForOrg, setEnabledForOrg] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [hiddenByUser, setHiddenByUser] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cargar config + estado feature + provider
  useEffect(() => {
    const readHidden = () => {
      try {
        setHiddenByUser(localStorage.getItem(HIDDEN_LS_KEY) === "true");
      } catch {}
    };
    readHidden();

    // Escuchar cambios en otras tabs O cuando el AiVisibilityToggle dispatch
    // un storage event sintético en la misma tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === HIDDEN_LS_KEY || e.key === null) {
        readHidden();
      }
    };
    window.addEventListener("storage", onStorage);

    fetch("/api/ai/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setEnabledForOrg(!!(data && data.configured && data.enabled));
        if (data && isValidProvider(data.provider)) {
          setProvider(data.provider);
        }
      })
      .catch(() => setEnabledForOrg(false));

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  // Focus al abrir
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Esc cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const hideForever = () => {
    try {
      localStorage.setItem(HIDDEN_LS_KEY, "true");
    } catch {}
    setHiddenByUser(true);
    setOpen(false);
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setError(null);

    const optimistic: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, optimistic]);
    setThinking(true);

    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, newMessage: text }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: "Error desconocido" }));
        setError(data.error ?? "Error al consultar al asistente.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      const data = await r.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setThinking(false);
    }
  }, [input, messages, thinking]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Gates de visibilidad
  if (permsLoading || enabledForOrg === null) return null;
  if (!enabledForOrg) return null;
  if (!can("ai", "view") || !can("ai", "create")) return null;
  if (hiddenByUser) return null;

  // Nombre del provider para el header
  const providerLabel = provider
    ? PROVIDER_CATALOG[provider].label.split(" (")[1]?.replace(")", "") ?? PROVIDER_CATALOG[provider].label
    : "AI";

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Asistente IA"
          aria-label="Abrir asistente IA"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 50,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--c-accent-blue) 0%, var(--c-accent-violet) 100%)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgb(var(--c-accent-blue-rgb) / 0.4)",
            transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <Sparkles size={22} strokeWidth={1.75} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 50,
            width: "min(420px, calc(100vw - 40px))",
            height: "min(660px, calc(100vh - 40px))",
            background: "var(--c-bg-darker)",
            border: "1px solid var(--c-border)",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 20px 60px var(--c-shadow-strong)",
            animation: "flo-fade-in-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--c-border)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "linear-gradient(90deg, rgb(var(--c-accent-blue-rgb) / 0.08), rgb(var(--c-accent-violet-rgb) / 0.08))",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "linear-gradient(135deg, var(--c-accent-blue), var(--c-accent-violet))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={14} style={{ color: "#fff" }} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>Asistente FlowOS</p>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--c-text-muted)",
                  margin: "2px 0 0",
                  fontFamily: "monospace",
                }}
              >
                {providerLabel} · BYOK · respeta tus permisos
              </p>
            </div>
            <button
              onClick={reset}
              title="Reiniciar conversación"
              aria-label="Reiniciar conversación"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--c-text-muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={hideForever}
              title="Ocultar el asistente (podés volver a habilitarlo borrando el storage)"
              aria-label="Ocultar"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--c-text-muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              <EyeOff size={13} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title="Minimizar"
              aria-label="Cerrar"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--c-text-muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.filter(isVisibleMessage).length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 12px",
                  color: "var(--c-text-muted)",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <Sparkles size={28} style={{ margin: "0 auto 8px", display: "block", color: "var(--c-border)" }} />
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--c-text-secondary)", fontWeight: 500 }}>
                  ¿En qué te ayudo?
                </p>
                <p style={{ margin: 0 }}>Probá pedirme algo como:</p>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    "Listame los proyectos activos",
                    "Mostrame el organigrama",
                    "Creá un proyecto de marketing con un hito para el Q3",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      style={{
                        background: "var(--c-bg-surface)",
                        border: "1px solid var(--c-border)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 11,
                        color: "var(--c-text-secondary)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      💬 {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              if (!isVisibleMessage(m)) return null;
              const text = getMessageText(m);
              const tools = m.role === "assistant" ? getToolUses(m) : [];
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className="flo-msg-in"
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    background: isUser ? "rgb(var(--c-accent-blue-rgb) / 0.15)" : "var(--c-bg-surface)",
                    border: `1px solid ${isUser ? "rgb(var(--c-accent-blue-rgb) / 0.3)" : "var(--c-border)"}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 12.5,
                    color: "var(--c-text-primary)",
                    lineHeight: 1.55,
                    wordBreak: "break-word",
                  }}
                >
                  {isUser ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
                  ) : (
                    <div className="flo-md-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p style={{ margin: "0 0 6px", lineHeight: 1.55 }}>{children}</p>,
                          ul: ({ children }) => (
                            <ul style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{children}</ol>
                          ),
                          li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                          strong: ({ children }) => (
                            <strong style={{ color: "var(--c-text-primary)", fontWeight: 600 }}>{children}</strong>
                          ),
                          em: ({ children }) => <em style={{ color: "var(--c-text-secondary)" }}>{children}</em>,
                          code: ({ children }) => (
                            <code
                              style={{
                                background: "var(--c-bg-elevated)",
                                border: "1px solid var(--c-border)",
                                borderRadius: 4,
                                padding: "1px 5px",
                                fontSize: 11,
                                fontFamily: "monospace",
                                color: "var(--c-accent-cyan)",
                              }}
                            >
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre
                              style={{
                                background: "var(--c-bg-base)",
                                border: "1px solid var(--c-border)",
                                borderRadius: 6,
                                padding: 8,
                                fontSize: 11,
                                overflowX: "auto",
                                margin: "6px 0",
                              }}
                            >
                              {children}
                            </pre>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--c-accent-blue)", textDecoration: "underline" }}
                            >
                              {children}
                            </a>
                          ),
                          h1: ({ children }) => (
                            <h1 style={{ fontSize: 14, fontWeight: 700, margin: "8px 0 4px" }}>{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 4px" }}>{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 style={{ fontSize: 12.5, fontWeight: 600, margin: "6px 0 3px" }}>{children}</h3>
                          ),
                        }}
                      >
                        {text}
                      </ReactMarkdown>
                    </div>
                  )}
                  {tools.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {tools.map((t, ti) => (
                        <span
                          key={ti}
                          style={{
                            fontSize: 10,
                            fontFamily: "monospace",
                            background: "rgb(var(--c-accent-violet-rgb) / 0.12)",
                            color: "var(--c-accent-violet)",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                          title={t}
                        >
                          ⚐ {prettyToolName(t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {thinking && (
              <div
                className="flo-msg-in"
                style={{
                  alignSelf: "flex-start",
                  background: "var(--c-bg-surface)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span className="flo-typing-dot" style={{ background: "var(--c-text-muted)" }} />
                <span className="flo-typing-dot" style={{ background: "var(--c-text-muted)" }} />
                <span className="flo-typing-dot" style={{ background: "var(--c-text-muted)" }} />
              </div>
            )}
            {error && (
              <div
                style={{
                  alignSelf: "stretch",
                  background: "rgb(var(--c-accent-red-rgb) / 0.1)",
                  border: "1px solid rgb(var(--c-accent-red-rgb) / 0.3)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "var(--c-accent-red)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              padding: 10,
              borderTop: "1px solid var(--c-border)",
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribí tu pedido…"
              rows={1}
              style={{
                flex: 1,
                background: "var(--c-bg-surface)",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12.5,
                color: "var(--c-text-primary)",
                outline: "none",
                resize: "none",
                maxHeight: 120,
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || thinking}
              title="Enviar (Enter)"
              aria-label="Enviar"
              style={{
                background:
                  !input.trim() || thinking
                    ? "var(--c-border)"
                    : "linear-gradient(135deg, var(--c-accent-blue), var(--c-accent-violet))",
                border: "none",
                color: "#fff",
                width: 34,
                height: 34,
                borderRadius: 8,
                cursor: !input.trim() || thinking ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
