"use client";

// Onboarding wizard de 4 pasos para orgs nuevas.
// Aparece automáticamente si /api/onboarding/state devuelve isEmpty=true
// Y el user no apretó "skip forever" (flowos-onboarding-skipped en localStorage).

import { useCallback, useEffect, useState } from "react";
import {
  GitBranch, Building2, UserCircle2, Sparkles, X, Check,
  ArrowRight, Loader2, SkipForward,
} from "lucide-react";

const SKIP_LS_KEY = "flowos-onboarding-skipped";

type Step = "intro" | "division" | "department" | "employee" | "done";

interface StepProgress {
  divisionsCreated: number;
  departmentsCreated: number;
  employeesCreated: number;
}

export default function OnboardingWizard() {
  const [shouldShow, setShouldShow] = useState<boolean | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>("intro");
  const [progress, setProgress] = useState<StepProgress>({
    divisionsCreated: 0, departmentsCreated: 0, employeesCreated: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inputs por paso
  const [divName, setDivName] = useState("");
  const [divDescription, setDivDescription] = useState("");
  const [divisionId, setDivisionId] = useState<string | null>(null);

  const [deptName, setDeptName] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const [empName, setEmpName] = useState("");
  const [empJobTitle, setEmpJobTitle] = useState("");
  const [empEmail, setEmpEmail] = useState("");

  // Detectar si mostrar el wizard
  useEffect(() => {
    try {
      if (localStorage.getItem(SKIP_LS_KEY) === "true") {
        setShouldShow(false);
        return;
      }
    } catch {}

    fetch("/api/onboarding/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.isEmpty) {
          setShouldShow(true);
        } else {
          setShouldShow(false);
        }
      })
      .catch(() => setShouldShow(false));
  }, []);

  const skipForever = useCallback(() => {
    try { localStorage.setItem(SKIP_LS_KEY, "true"); } catch {}
    setShouldShow(false);
  }, []);

  const closeWizard = useCallback(() => {
    setShouldShow(false);
  }, []);

  // ─── Step handlers ──────────────────────────────────────────────────────

  const createDivision = async () => {
    if (!divName.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: divName.trim(), description: divDescription.trim() || undefined }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setDivisionId(data.id);
      setProgress((p) => ({ ...p, divisionsCreated: p.divisionsCreated + 1 }));
      setCurrentStep("department");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la división");
    } finally {
      setBusy(false);
    }
  };

  const createDepartment = async () => {
    if (!deptName.trim() || !divisionId) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deptName.trim(), divisionId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setDepartmentId(data.id);
      setProgress((p) => ({ ...p, departmentsCreated: p.departmentsCreated + 1 }));
      setCurrentStep("employee");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el departamento");
    } finally {
      setBusy(false);
    }
  };

  const createEmployee = async () => {
    if (!empName.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: empName.trim(),
          jobTitle: empJobTitle.trim() || undefined,
          email: empEmail.trim() || undefined,
          departmentId,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setProgress((p) => ({ ...p, employeesCreated: p.employeesCreated + 1 }));
      setCurrentStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el empleado");
    } finally {
      setBusy(false);
    }
  };

  if (shouldShow !== true) return null;

  // ─── UI ──────────────────────────────────────────────────────────────────

  const stepIndex = ["intro", "division", "department", "employee", "done"].indexOf(currentStep);
  const totalSteps = 4; // (división, depto, empleado, done) — intro no cuenta

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(12px, 4vh, 32px) clamp(12px, 4vw, 32px)",
      }}
    >
      <div
        style={{
          background: "var(--c-bg-surface)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px var(--c-shadow-strong)",
          animation: "flo-fade-in-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--c-border)",
            background: "linear-gradient(90deg, rgb(var(--c-accent-blue-rgb) / 0.08), rgb(var(--c-accent-violet-rgb) / 0.08))",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: "linear-gradient(135deg, var(--c-accent-blue), var(--c-accent-violet))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Sparkles size={16} style={{ color: "#fff" }} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>
              Bienvenido a FlowOS
            </p>
            <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "2px 0 0", fontFamily: "monospace" }}>
              Setup en 3 pasos · ~2 minutos
            </p>
          </div>
          <button
            onClick={closeWizard}
            title="Cerrar (podés volver más tarde)"
            aria-label="Cerrar"
            style={{
              background: "transparent", border: "none",
              color: "var(--c-text-muted)", cursor: "pointer", padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {currentStep !== "intro" && (
          <div style={{ padding: "12px 20px 0", display: "flex", gap: 4 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background:
                    i < stepIndex
                      ? "var(--c-accent-emerald)"
                      : i === stepIndex
                      ? "var(--c-accent-blue)"
                      : "var(--c-border)",
                  transition: "background 200ms ease",
                }}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: 24, flex: 1, overflowY: "auto" }}>
          {currentStep === "intro" && (
            <IntroStep
              onStart={() => setCurrentStep("division")}
              onSkip={skipForever}
            />
          )}

          {currentStep === "division" && (
            <FormStep
              icon={GitBranch}
              accentColor="var(--c-accent-blue)"
              title="Primera división"
              subtitle="Las divisiones son la unidad más alta del organigrama. Ej: Comercial, Operaciones, Marketing."
              busy={busy}
              error={error}
              onSubmit={createDivision}
              submitDisabled={!divName.trim()}
              onSkip={() => setCurrentStep("department")}
            >
              <input
                autoFocus
                value={divName}
                onChange={(e) => setDivName(e.target.value)}
                placeholder="Nombre de la división"
                style={inputStyle}
              />
              <input
                value={divDescription}
                onChange={(e) => setDivDescription(e.target.value)}
                placeholder="Descripción (opcional)"
                style={{ ...inputStyle, marginTop: 8 }}
              />
            </FormStep>
          )}

          {currentStep === "department" && (
            <FormStep
              icon={Building2}
              accentColor="var(--c-accent-amber)"
              title="Primer departamento"
              subtitle="Cada división se divide en departamentos. Ej: Ventas, Compras, Marketing Digital."
              busy={busy}
              error={error}
              onSubmit={createDepartment}
              submitDisabled={!deptName.trim() || !divisionId}
              onSkip={() => setCurrentStep("employee")}
            >
              <input
                autoFocus
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="Nombre del departamento"
                style={inputStyle}
              />
            </FormStep>
          )}

          {currentStep === "employee" && (
            <FormStep
              icon={UserCircle2}
              accentColor="var(--c-accent-emerald)"
              title="Primer empleado"
              subtitle="Agregá una persona o dejá el puesto vacante. Después podés sumar más desde Empleados."
              busy={busy}
              error={error}
              onSubmit={createEmployee}
              submitDisabled={!empName.trim()}
              onSkip={() => setCurrentStep("done")}
            >
              <input
                autoFocus
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                placeholder='Nombre completo (o "Vacante — Director Comercial")'
                style={inputStyle}
              />
              <input
                value={empJobTitle}
                onChange={(e) => setEmpJobTitle(e.target.value)}
                placeholder="Cargo / título del puesto"
                style={{ ...inputStyle, marginTop: 8 }}
              />
              <input
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                placeholder="Email (opcional)"
                type="email"
                inputMode="email"
                style={{ ...inputStyle, marginTop: 8 }}
              />
            </FormStep>
          )}

          {currentStep === "done" && (
            <DoneStep
              progress={progress}
              onClose={closeWizard}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step components ────────────────────────────────────────────────────────

function IntroStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
          background: "linear-gradient(135deg, rgb(var(--c-accent-blue-rgb) / 0.2), rgb(var(--c-accent-violet-rgb) / 0.2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.3)",
        }}
      >
        <Sparkles size={28} style={{ color: "var(--c-accent-blue)" }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--c-text-primary)", margin: "0 0 8px" }}>
        Vamos a armar tu organización
      </h2>
      <p style={{ fontSize: 13, color: "var(--c-text-muted)", margin: "0 0 24px", lineHeight: 1.55 }}>
        En 3 pasos vas a tener una división, un departamento y un primer empleado.
        Es la base mínima para que todo lo demás (proyectos, procesos BPM, asistente IA) funcione bien.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", marginBottom: 24 }}>
        {[
          { icon: GitBranch, label: "Crear primera división", color: "var(--c-accent-blue)" },
          { icon: Building2, label: "Agregar un departamento", color: "var(--c-accent-amber)" },
          { icon: UserCircle2, label: "Sumar tu primer empleado", color: "var(--c-accent-emerald)" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: 10,
              background: "var(--c-bg-elevated)",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: `${s.color}1a`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <s.icon size={14} style={{ color: s.color }} />
            </div>
            <p style={{ fontSize: 13, color: "var(--c-text-primary)", margin: 0 }}>
              <span style={{ fontFamily: "monospace", color: "var(--c-text-muted)", marginRight: 6 }}>{i + 1}.</span>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onSkip}
          style={{
            flex: "0 0 auto",
            background: "transparent",
            border: "1px solid var(--c-border)",
            color: "var(--c-text-muted)",
            borderRadius: 8, padding: "10px 14px",
            fontSize: 13, cursor: "pointer",
          }}
        >
          Saltar
        </button>
        <button
          onClick={onStart}
          style={{
            flex: 1,
            background: "linear-gradient(135deg, var(--c-accent-blue), var(--c-accent-violet))",
            border: "none", color: "#fff",
            borderRadius: 8, padding: "10px 14px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          Empezar
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function FormStep({
  icon: Icon,
  accentColor,
  title,
  subtitle,
  children,
  onSubmit,
  submitDisabled,
  onSkip,
  busy,
  error,
}: {
  icon: typeof GitBranch;
  accentColor: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onSubmit: () => void;
  submitDisabled: boolean;
  onSkip: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 8,
            background: `${accentColor}1a`,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${accentColor}40`,
          }}
        >
          <Icon size={16} style={{ color: accentColor }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--c-text-primary)", margin: 0 }}>{title}</h3>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--c-text-muted)", margin: "0 0 18px", lineHeight: 1.55 }}>
        {subtitle}
      </p>

      <div>{children}</div>

      {error && (
        <p
          style={{
            margin: "12px 0 0",
            padding: "8px 12px",
            background: "rgb(var(--c-accent-red-rgb) / 0.08)",
            border: "1px solid rgb(var(--c-accent-red-rgb) / 0.3)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--c-accent-red)",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button
          onClick={onSkip}
          disabled={busy}
          style={{
            flex: "0 0 auto",
            background: "transparent",
            border: "1px solid var(--c-border)",
            color: "var(--c-text-muted)",
            borderRadius: 8, padding: "10px 14px",
            fontSize: 13, cursor: busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          <SkipForward size={13} />
          Saltar
        </button>
        <button
          onClick={onSubmit}
          disabled={submitDisabled || busy}
          style={{
            flex: 1,
            background: submitDisabled || busy
              ? "var(--c-bg-elevated)"
              : "linear-gradient(135deg, var(--c-accent-blue), var(--c-accent-violet))",
            border: "none",
            color: submitDisabled || busy ? "var(--c-text-muted)" : "#fff",
            borderRadius: 8, padding: "10px 14px",
            fontSize: 13, fontWeight: 600,
            cursor: submitDisabled || busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {busy ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Creando…
            </>
          ) : (
            <>
              Crear y continuar
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DoneStep({
  progress, onClose,
}: {
  progress: StepProgress;
  onClose: () => void;
}) {
  const total = progress.divisionsCreated + progress.departmentsCreated + progress.employeesCreated;
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px",
          background: "rgb(var(--c-accent-emerald-rgb) / 0.12)",
          border: "1px solid rgb(var(--c-accent-emerald-rgb) / 0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Check size={28} style={{ color: "var(--c-accent-emerald)" }} strokeWidth={2.5} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--c-text-primary)", margin: "0 0 8px" }}>
        {total > 0 ? "¡Listo, ya estás operativo!" : "Setup pendiente"}
      </h2>
      <p style={{ fontSize: 13, color: "var(--c-text-muted)", margin: "0 0 18px", lineHeight: 1.55 }}>
        {total > 0
          ? `Creaste ${progress.divisionsCreated} división, ${progress.departmentsCreated} departamento y ${progress.employeesCreated} empleado.`
          : "Podés volver a este wizard cuando quieras desde la página de Organigrama."}
      </p>

      {total > 0 && (
        <div
          style={{
            background: "var(--c-bg-elevated)",
            border: "1px solid var(--c-border)",
            borderRadius: 8,
            padding: 14,
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          <p style={{ fontSize: 11, color: "var(--c-text-muted)", margin: "0 0 8px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Próximos pasos sugeridos
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--c-text-secondary)", fontSize: 12.5, lineHeight: 1.7 }}>
            <li>Sumar más empleados y armar la jerarquía desde Organigrama</li>
            <li>Crear tu primer proyecto con VFP</li>
            <li>Importar un proceso BPM desde Templates</li>
            <li>Configurar el asistente IA en Settings (BYOK gratis con Gemini)</li>
          </ul>
        </div>
      )}

      <button
        onClick={onClose}
        style={{
          width: "100%",
          background: "linear-gradient(135deg, var(--c-accent-blue), var(--c-accent-violet))",
          border: "none", color: "#fff",
          borderRadius: 8, padding: "10px 14px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        Empezar a usar FlowOS
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--c-bg-elevated)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  color: "var(--c-text-primary)",
  outline: "none",
  fontFamily: "inherit",
};
