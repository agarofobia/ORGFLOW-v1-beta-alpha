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

type Theme = "dark" | "light" | "system";
type Lang = "es" | "en" | "pt";

const ACCENT_PRESETS = [
  { name: "Azul", hex: "#3D7EFF" },
  { name: "Esmeralda", hex: "#10D9A0" },
  { name: "Ámbar", hex: "#F59E0B" },
  { name: "Rosa", hex: "#F43F5E" },
  { name: "Violeta", hex: "#A855F7" },
  { name: "Cian", hex: "#06B6D4" },
  { name: "Lima", hex: "#84CC16" },
  { name: "Naranja", hex: "#F97316" },
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
      <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
        {label}
      </p>
      <h2 className="mt-1 text-lg font-semibold" style={{ color: "#E2E8F8" }}>{title}</h2>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-5" style={{ background: "#0E1220", border: "1px solid #1E2540" }}>
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
    color: "#F59E0B",
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
    color: "#3D7EFF",
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
    color: "#10D9A0",
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
  const [accent, setAccent] = useState<string>("#3D7EFF");
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
          <p className="mb-4 text-sm" style={{ color: "#7A8BAD" }}>
            Elegí el tema visual de la aplicación.
          </p>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
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
                    ? { background: "rgba(61,126,255,0.12)", border: "2px solid #3D7EFF", color: "#E2E8F8" }
                    : { background: "#141928", border: "1px solid #1E2540", color: "#7A8BAD" }
                }
              >
                <span style={theme === value ? { color: "#3D7EFF" } : undefined}>{icon}</span>
                {label}
                {theme === value && (
                  <Check className="h-3.5 w-3.5" style={{ color: "#3D7EFF" }} strokeWidth={2.5} />
                )}
              </button>
            ))}
          </div>
          {theme === "light" && (
            <p className="mt-3 text-xs" style={{ color: "#F59E0B" }}>
              ⚠ El tema claro está en versión beta — la mayoría de las superficies se adaptan, pero algunos paneles internos pueden seguir viéndose oscuros mientras refinamos.
            </p>
          )}
        </Card>
      </section>

      {/* ── Color de acento ── */}
      <section className="mb-10">
        <SectionTitle label="Preferencias" title="Color de acento" />
        <Card>
          <p className="mb-4 text-sm" style={{ color: "#7A8BAD" }}>
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
                  border: accent === p.hex ? `3px solid #E2E8F8` : `3px solid transparent`,
                  transition: "transform 0.1s",
                }} />
                <span style={{ fontSize: 10, color: accent === p.hex ? "#E2E8F8" : "#7A8BAD", fontFamily: "monospace" }}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: 12, background: "#141928", border: "1px solid #1E2540", borderRadius: 6 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: accent, border: "1px solid #1E2540" }} />
            <span style={{ fontSize: 12, color: "#7A8BAD", fontFamily: "monospace" }}>Color personalizado:</span>
            <input
              type="color"
              value={accent}
              onChange={e => handleAccentClick(e.target.value)}
              style={{ width: 36, height: 28, border: "1px solid #1E2540", borderRadius: 4, background: "#0E1220", cursor: "pointer", padding: 2 }}
            />
            <input
              type="text"
              value={accent}
              onChange={e => { const v = e.target.value; setAccent(v); if (/^#[0-9A-Fa-f]{6}$/.test(v)) handleAccentClick(v); }}
              maxLength={7}
              style={{ width: 90, padding: "5px 8px", background: "#0E1220", border: "1px solid #1E2540", borderRadius: 4, color: "#E2E8F8", fontFamily: "monospace", fontSize: 12, outline: "none" }}
            />
          </div>
          <p className="mt-3 text-xs" style={{ color: "#F59E0B" }}>
            ⚠ Beta — el color de acento se aplica a botones primarios y enlaces principales. Los colores específicos de paneles (procesos, errores, etc.) se mantienen para preservar el significado.
          </p>
        </Card>
      </section>

      {/* ── Idioma ── */}
      <section className="mb-10">
        <SectionTitle label="Preferencias" title="Idioma" />
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4" style={{ color: "#3D7EFF" }} strokeWidth={1.75} />
            <p className="text-sm" style={{ color: "#7A8BAD" }}>
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
                    ? { background: "rgba(61,126,255,0.12)", border: "2px solid #3D7EFF", color: "#E2E8F8" }
                    : { background: "#141928", border: "1px solid #1E2540", color: "#7A8BAD" }
                }
              >
                <span className="text-xl">{flag}</span>
                <span>{label}</span>
                {lang === value && (
                  <Check className="ml-auto h-3.5 w-3.5" style={{ color: "#3D7EFF" }} strokeWidth={2.5} />
                )}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: "#7A8BAD" }}>
            Nota: el cambio de idioma completo requiere i18n. Por ahora se guarda la preferencia.
          </p>
        </Card>
      </section>

      {/* Guardar */}
      <div className="mb-12 flex items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded px-5 py-2 text-sm font-medium text-white transition-all"
          style={{ background: "#3D7EFF", boxShadow: "0 0 16px rgba(61,126,255,0.35)" }}
        >
          Aplicar cambios
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: "#10D9A0" }}>
            <Check className="h-4 w-4" strokeWidth={2.5} /> Guardado
          </span>
        )}
      </div>

      {/* ── Roles y permisos ── */}
      <section>
        <SectionTitle label="Sistema" title="Roles y permisos" />
        <div
          className="mb-6 flex items-start gap-3 rounded-lg p-4"
          style={{ background: "rgba(61,126,255,0.08)", border: "1px solid rgba(61,126,255,0.2)" }}
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#3D7EFF" }} strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>
              Permisos gestionados por Clerk
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "#7A8BAD" }}>
              FlowOS usa <strong style={{ color: "#E2E8F8" }}>Clerk Organizations</strong> para gestionar roles.
              Cada miembro tiene un rol dentro de la organización que determina qué puede ver y hacer.
              Los roles se asignan desde{" "}
              <strong style={{ color: "#E2E8F8" }}>Equipo → Manage members</strong>.
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
                  <p className="font-semibold" style={{ color: "#E2E8F8" }}>{r.role}</p>
                  <code className="font-mono text-[10px]" style={{ color: r.color }}>{r.badge}</code>
                </div>
              </div>

              <p className="mb-4 text-sm leading-relaxed" style={{ color: "#7A8BAD" }}>
                {r.description}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#10D9A0" }}>
                    ✓ Puede
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {r.can.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs" style={{ color: "#C4CFEA" }}>
                        <span className="mt-0.5 shrink-0" style={{ color: "#10D9A0" }}>•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {r.cannot.length > 0 && (
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#F43F5E" }}>
                      ✕ No puede
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {r.cannot.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs" style={{ color: "#C4CFEA" }}>
                          <span className="mt-0.5 shrink-0" style={{ color: "#F43F5E" }}>•</span>
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

      {/* ── Plan y facturación ── */}
      <section className="mt-10">
        <SectionTitle label="Sistema" title="Plan y facturación" />
        <Link href="/dashboard/billing" className="block">
          <div className="flex items-center gap-4 rounded-lg p-5 transition-all hover:-translate-y-px"
            style={{ background: "#0E1220", border: "1px solid #1E2540" }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "rgba(61,126,255,0.12)" }}>
              <CreditCard className="h-5 w-5" style={{ color: "#3D7EFF" }} strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "#E2E8F8" }}>Gestionar suscripción</p>
              <p className="mt-0.5 text-xs" style={{ color: "#7A8BAD" }}>Cambiar plan, métodos de pago y ver historial de facturas.</p>
            </div>
            <ChevronRight className="h-4 w-4" style={{ color: "#7A8BAD" }} />
          </div>
        </Link>
      </section>

    </div>
  );
}
