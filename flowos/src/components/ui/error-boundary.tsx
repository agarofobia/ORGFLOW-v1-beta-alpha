"use client";

// Error boundary global del dashboard. Si algún componente del árbol crashea,
// muestra UI de error en vez de pantalla en blanco. Permite al usuario recargar.

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // En prod podríamos mandar a Sentry/log service.
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--c-bg-base)", padding: 24,
        }}>
          <div style={{
            maxWidth: 460, padding: 28, background: "var(--c-bg-surface)",
            border: "1px solid rgb(var(--c-accent-red-rgb) / 0.3)", borderRadius: 12, textAlign: "center",
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, margin: "0 auto 14px",
              background: "rgb(var(--c-accent-red-rgb) / 0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AlertTriangle style={{ width: 22, height: 22, color: "var(--c-accent-red)" }} />
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--c-text-primary)" }}>
              Algo se rompió en esta pantalla
            </h2>
            <p style={{ margin: "8px 0 18px", fontSize: 13, color: "var(--c-text-muted)", lineHeight: 1.55 }}>
              Tu información está a salvo. Probá recargar o volver atrás. Si el problema persiste,
              tomá una captura del mensaje técnico de abajo y avisame.
            </p>
            <pre style={{
              margin: "0 0 18px", padding: "10px 12px",
              background: "var(--c-bg-base)", border: "1px solid var(--c-border)", borderRadius: 6,
              fontSize: 11, color: "var(--c-accent-red)", textAlign: "left",
              overflow: "auto", maxHeight: 100, fontFamily: "monospace",
            }}>
              {this.state.error.message}
            </pre>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => window.location.reload()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "var(--c-accent-blue)", color: "#fff", border: "none", borderRadius: 6,
                  padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                <RefreshCw style={{ width: 13, height: 13 }} />
                Recargar
              </button>
              <button onClick={this.reset}
                style={{
                  background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: 6,
                  padding: "9px 16px", fontSize: 13, cursor: "pointer",
                }}>
                Volver
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
