"use client";

import { useState, useEffect } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Globe,
  ShieldCheck,
  Crown,
  User,
  Eye,
  Check,
  CreditCard,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import PermissionGroupsSection from "./PermissionGroupsSection";
import AiConfigSection from "./AiConfigSection";
import AiVisibilityToggle from "./AiVisibilityToggle";
import WebhooksSection from "./WebhooksSection";

type Theme = "dark" | "light" | "system";
type Lang = "es" | "en" | "pt";

const ACCENT_PRESETS = [
  { name: "Azul", hex: "var(--c-accent-blue)" },
  { name: "Esmeralda", hex: "var(--c-accent-emerald)" },
  { name: "Ámbar", hex: "var(--c-accent-amber)" },
  { name: "Rosa", hex: "var(--c-accent-red)" },
  { name: "Violeta", hex: "var(--c-accent-violet)" },
  { name: "Cian", hex: "var(--c-accent-cyan)" },
  { name: "Lima", hex: "var(--c-accent-lime)" },
  { name: "Naranja", hex: "var(--c-accent-orange)" },
];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.add("light");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(prefersDark ? "dark" : "light");
  }
  localStorage.setItem("flowos-theme", theme);
  root.style.colorScheme = (theme === "light" || (theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches)) ? "light" : "dark";
  window.dispatchEvent(new Event("flowos-theme-changed"));
}

function applyAccent(hex: string) {
  const root = document.documentElement;
  root.style.setProperty("--app-accent", hex);
  localStorage.setItem("flowos-accent", hex);
  window.dispatchEvent(new Event("flowos-theme-changed"));
}

function SectionTitle({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
        {label}
      </p>
      <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--c-text-primary)" }}>{title}</h2>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-5" style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}>
      {children}
    </div>
  );
}

interface PermRole {
  role: string;
  icon: React.ReactNode;
  color: string;
  badge: string;
  description: string;
  can: string[];
  cannot: string[];
}

const ROLES: PermRole[] = [
  {
    role: "Administrador",
    icon: <Crown className="h-4 w-4" />,
    color: "var(--c-accent-amber)",
    badge: "org:admin",
    description: "Acceso completo a la organización. Puede gestionar miembros, roles, facturación y configuración.",
    can: [
      "Ver todas las secciones del dashboard",
      "Crear, editar y eliminar empleados",
      "Modificar el org chart y posiciones",
      "Crear y eliminar proyectos y tareas",
      "Gestionar documentos (crear, editar, eliminar)",
      "Invitar y remover miembros del equipo",
      "Asignar roles a miembros",
      "Acceder a Billing y cambiar plan",
      "Modificar configuración del sistema",
      "Cambiar tema e idioma de la app",
    ],
    cannot: [],
  },
  {
    role: "Miembro",
    icon: <User className="h-4 w-4" />,
    color: "var(--c-accent-blue)",
    badge: "org:member",
    description: "Acceso de colaboración. Puede trabajar en proyectos y documentos, pero no puede modificar la organización.",
    can: [
      "Ver el dashboard, org chart y empleados",
      "Crear y actualizar tareas en proyectos",
      "Crear y editar documentos propios",
      "Ver miembros del equipo",
    ],
    cannot: [
      "Invitar o remover miembros",
      "Asignar roles",
      "Acceder a Billing",
      "Modificar configuración del sistema",
      "Eliminar proyectos completos",
    ],
  },
  {
    role: "Solo lectura",
    icon: <Eye className="h-4 w-4" />,
    color: "var(--c-accent-emerald)",
    badge: "org:viewer",
    description: "Acceso de visualización. Ideal para auditores o clientes que solo necesitan ver el estado de la organización.",
    can: [
      "Ver el dashboard y estadísticas",
      "Ver el org chart (sin editar)",
      "Ver lista de empleados",
      "Ver proyectos y tareas",
      "Ver documentos",
    ],
    cannot: [
      "Crear o editar cualquier contenido",
      "Invitar miembros",
      "Acceder a Billing",
      "Modificar configuración",
      "Crear proyectos, tareas o documentos",
    ],
  },
];

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang, setLang] = useState<Lang>("es");
  const [accent, setAccent] = useState<string>("var(--c-accent-blue)");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("flowos-theme") as Theme | null;
    const l = localStorage.getItem("flowos-lang") as Lang | null;
    const a = localStorage.getItem("flowos-accent");
    if (t) setTheme(t);
    if (l) setLang(l);
    if (a) setAccent(a);
  }, []);

  const handleThemeClick = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  const handleAccentClick = (hex: string) => {
    setAccent(hex);
    applyAccent(hex);
  };

  const handleSave = () => {
    applyTheme(theme);
    applyAccent(accent);
    localStorage.setItem("flowos-lang", lang);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "dark", label: "Oscuro", icon: <Moon className="h-5 w-5" /> },
    { value: "light", label: "Claro", icon: <Sun className="h-5 w-5" /> },
    { value: "system", label: "Sistema", icon: <Monitor className="h-5 w-5" /> },
  ];

  const LANGS: { value: Lang; label: string; flag: string }[] = [
    { value: "es", label: "Español", flag: "🇦🇷" },
    { value: "en", label: "English", flag: "🇺🇸" },
    { value: "pt", label: "Português", flag: "🇧🇷" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">

      {/* ── Apariencia ── */}
      <section className="mb-10">
        <SectionTitle label="Preferencias" title="Apariencia" />
        <Card>
          <p className="mb-4 text-sm" style={{ color: "var(--c-text-muted)" }}>
            Elegí el tema visual de la aplicación.
          </p>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>
            Tema
          </p>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => handleThemeClick(value)}
                className="flex flex-col items-center gap-2 rounded-lg p-4 text-sm font-medium transition-all"
                style={
                  theme === value
                    ? { background: "rgb(var(--c-accent-blue-rgb) / 0.12)", border: "2px solid var(--c-accent-blue)", color: "var(--c-text-primary)" }
                    : { background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" }
                }
              >
                <span style={theme === value ? { color: "var(--c-accent-blue)" } : undefined}>{icon}</span>
                {label}
                {theme === value && (
                  <Check className="h-3.5 w-3.5" style={{ color: "var(--c-accent-blue)" }} strokeWidth={2.5} />
                )}
              </button>
            ))}
          </div>
          {theme === "light" && (
            <p className="mt-3 text-xs" style={{ color: "var(--c-accent-amber)" }}>
              ⚠ El tema claro está en versión beta — la mayoría de las superficies se adaptan, pero algunos paneles internos pueden seguir viéndose oscuros mientras refinamos.
            </p>
          )}
        </Card>
      </section>

      {/* ── Color de acento ── */}
      <section className="mb-10">
        <SectionTitle label="Preferencias" title="Color de acento" />
        <Card>
          <p className="mb-4 text-sm" style={{ color: "var(--c-text-muted)" }}>
            Color predominante usado en botones primarios, links y elementos interactivos.
          </p>
          <div className="flex flex-wrap gap-3">
            {ACCENT_PRESETS.map(p => (
              <button
                key={p.hex}
                onClick={() => handleAccentClick(p.hex)}
                title={p.name}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  background: "transparent", border: "none", cursor: "pointer", padding: 4,
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: "50%", background: p.hex,
                  border: accent === p.hex ? `3px solid var(--c-text-primary)` : `3px solid transparent`,
                  transition: "transform 0.1s",
                }} />
                <span style={{ fontSize: 10, color: accent === p.hex ? "var(--c-text-primary)" : "var(--c-text-muted)", fontFamily: "monospace" }}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: 12, background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", borderRadius: 6 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: accent, border: "1px solid var(--c-border)" }} />
            <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontFamily: "monospace" }}>Color personalizado:</span>
            <input
              type="color"
              value={accent}
              onChange={e => handleAccentClick(e.target.value)}
              style={{ width: 36, height: 28, border: "1px solid var(--c-border)", borderRadius: 4, background: "var(--c-bg-surface)", cursor: "pointer", padding: 2 }}
            />
            <input
              type="text"
              value={accent}
              onChange={e => { const v = e.target.value; setAccent(v); if (/^#[0-9A-Fa-f]{6}$/.test(v)) handleAccentClick(v); }}
              maxLength={7}
              style={{ width: 90, padding: "5px 8px", background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 4, color: "var(--c-text-primary)", fontFamily: "monospace", fontSize: 12, outline: "none" }}
            />
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--c-accent-amber)" }}>
            ⚠ Beta — el color de acento se aplica a botones primarios y enlaces principales. Los colores específicos de paneles (procesos, errores, etc.) se mantienen para preservar el significado.
          </p>
        </Card>
      </section>

      {/* ── Idioma ── */}
      <section className="mb-10">
        <SectionTitle label="Preferencias" title="Idioma" />
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4" style={{ color: "var(--c-accent-blue)" }} strokeWidth={1.75} />
            <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>
              Cambia el idioma de toda la interfaz.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {LANGS.map(({ value, label, flag }) => (
              <button
                key={value}
                onClick={() => setLang(value)}
                className="flex items-center gap-3 rounded-lg p-3 text-sm font-medium transition-all"
                style={
                  lang === value
                    ? { background: "rgb(var(--c-accent-blue-rgb) / 0.12)", border: "2px solid var(--c-accent-blue)", color: "var(--c-text-primary)" }
                    : { background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" }
                }
              >
                <span className="text-xl">{flag}</span>
                <span>{label}</span>
                {lang === value && (
                  <Check className="ml-auto h-3.5 w-3.5" style={{ color: "var(--c-accent-blue)" }} strokeWidth={2.5} />
                )}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--c-text-muted)" }}>
            Nota: el sign-in, switcher de organización y settings de usuario (Clerk) se muestran en
            el idioma seleccionado. El resto de la app se traducirá progresivamente.
          </p>
        </Card>
      </section>

      {/* Guardar */}
      <div className="mb-12 flex items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded px-5 py-2 text-sm font-medium text-white transition-all"
          style={{ background: "var(--c-accent-blue)", boxShadow: "0 0 16px rgb(var(--c-accent-blue-rgb) / 0.35)" }}
        >
          Aplicar cambios
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--c-accent-emerald)" }}>
            <Check className="h-4 w-4" strokeWidth={2.5} /> Guardado
          </span>
        )}
      </div>

      {/* ── Roles y permisos ── */}
      <section>
        <SectionTitle label="Sistema" title="Roles y permisos" />
        <div
          className="mb-6 flex items-start gap-3 rounded-lg p-4"
          style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.08)", border: "1px solid rgb(var(--c-accent-blue-rgb) / 0.2)" }}
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--c-accent-blue)" }} strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>
              Permisos gestionados por Clerk
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
              FlowOS usa <strong style={{ color: "var(--c-text-primary)" }}>Clerk Organizations</strong> para gestionar roles.
              Cada miembro tiene un rol dentro de la organización que determina qué puede ver y hacer.
              Los roles se asignan desde{" "}
              <strong style={{ color: "var(--c-text-primary)" }}>Equipo → Manage members</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {ROLES.map((r) => (
            <Card key={r.role}>
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: `${r.color}18`, color: r.color }}
                >
                  {r.icon}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "var(--c-text-primary)" }}>{r.role}</p>
                  <code className="font-mono text-[10px]" style={{ color: r.color }}>{r.badge}</code>
                </div>
              </div>

              <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
                {r.description}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-accent-emerald)" }}>
                    ✓ Puede
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {r.can.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
                        <span className="mt-0.5 shrink-0" style={{ color: "var(--c-accent-emerald)" }}>•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {r.cannot.length > 0 && (
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-accent-red)" }}>
                      ✕ No puede
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {r.cannot.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs" style={{ color: "var(--c-text-secondary)" }}>
                          <span className="mt-0.5 shrink-0" style={{ color: "var(--c-accent-red)" }}>•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Grupos de permisos DB ── */}
      <PermissionGroupsSection />

      {/* ── Asistente IA (BYOK) — config (admin) + visibilidad personal (todos) ── */}
      <AiConfigSection />
      <AiVisibilityToggle />

      {/* ── Webhooks salientes (integración con apps externas) ── */}
      <WebhooksSection />

      {/* ── Plan y facturación ── */}
      <section className="mt-10">
        <SectionTitle label="Sistema" title="Plan y facturación" />
        <Link href="/dashboard/billing" className="block">
          <div className="flex items-center gap-4 rounded-lg p-5 transition-all hover:-translate-y-px"
            style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "rgb(var(--c-accent-blue-rgb) / 0.12)" }}>
              <CreditCard className="h-5 w-5" style={{ color: "var(--c-accent-blue)" }} strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--c-text-primary)" }}>Gestionar suscripción</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--c-text-muted)" }}>Cambiar plan, métodos de pago y ver historial de facturas.</p>
            </div>
            <ChevronRight className="h-4 w-4" style={{ color: "var(--c-text-muted)" }} />
          </div>
        </Link>
      </section>

    </div>
  );
}
