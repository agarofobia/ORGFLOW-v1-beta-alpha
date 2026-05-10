import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { PLAN_LIST } from "@/lib/plans";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--background))] grain">
      {/* ─── Nav ─────────────────────────────────────────────────────── */}
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 pb-2 md:px-10 md:pt-8">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="font-display text-3xl tracking-tight">FlowOS</span>
          <span className="section-num translate-y-[-2px]">v0.1</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <Link href="#features" className="text-sm hover:text-[hsl(var(--accent))] transition-colors">
            Producto
          </Link>
          <Link href="#pricing" className="text-sm hover:text-[hsl(var(--accent))] transition-colors">
            Precios
          </Link>
          <Link href="#manifesto" className="text-sm hover:text-[hsl(var(--accent))] transition-colors">
            Manifiesto
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="hidden text-sm hover:text-[hsl(var(--accent))] transition-colors md:inline"
          >
            Ingresar
          </Link>
          <Link href="/sign-up" className="btn-ink !px-5 !py-2 !text-sm">
            Empezar
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-32 md:px-10 md:pt-24 md:pb-40">
        {/* Etiqueta editorial */}
        <div className="mb-10 flex items-center gap-3 opacity-0 animate-fade-up">
          <span className="section-num">VOL. 01 — 2026</span>
          <div className="h-px flex-1 max-w-[120px] bg-[hsl(var(--border))]" />
          <span className="label">Sistema operativo de empresa</span>
        </div>

        {/* Headline asimétrico */}
        <h1
          className="font-display text-[3.5rem] leading-[0.92] tracking-tight md:text-[7.5rem] lg:text-[9rem] opacity-0 animate-fade-up"
          style={{ animationDelay: "120ms" }}
        >
          Toda tu empresa.
          <br />
          <span className="italic text-[hsl(var(--flow-rust))]">
            Una sola fuente
          </span>
          <br />
          de verdad.
        </h1>

        {/* Subhead a la derecha — layout grid asimétrico */}
        <div className="mt-16 grid gap-12 md:grid-cols-12 md:gap-8">
          <div
            className="md:col-span-5 md:col-start-7 opacity-0 animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            <p className="text-lg leading-relaxed text-[hsl(var(--muted-foreground))] md:text-xl">
              Org chart, proyectos, wiki, CRM. Reemplazá Notion, Linear, Slack,
              Airtable y media docena de SaaS más.{" "}
              <span className="text-[hsl(var(--foreground))]">
                Tu equipo en un solo lugar.
              </span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/sign-up" className="btn-ink">
                Empezar gratis
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <Link href="#features" className="btn-ghost">
                Ver el producto
              </Link>
            </div>
            <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
              Plan Free para siempre. Sin tarjeta. Hasta 5 miembros.
            </p>
          </div>
        </div>

        {/* Decoración: línea diagonal con número */}
        <div className="pointer-events-none absolute right-6 top-32 hidden flex-col items-end gap-2 md:flex md:right-10">
          <div className="h-32 w-px bg-[hsl(var(--border))]" />
          <span className="section-num rotate-90 origin-top-right translate-x-2">
            ◇ FlowOS / Estudio
          </span>
        </div>
      </section>

      {/* ─── Línea de regla editorial ─────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="rule" />
      </div>

      {/* ─── Sección: Lo que reemplazás ──────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <span className="section-num">02 — Reemplaza</span>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">
              Una herramienta.
              <br />
              <span className="italic text-[hsl(var(--flow-ochre))]">
                Adiós a seis.
              </span>
            </h2>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <ul className="grid grid-cols-2 gap-y-6 gap-x-8 text-base">
              {[
                ["Notion", "Wiki interna y docs"],
                ["Linear", "Tareas y proyectos"],
                ["Airtable", "Datos estructurados"],
                ["Lattice", "Org chart y RRHH"],
                ["HubSpot", "CRM y pipelines"],
                ["Slack Connect", "Invitaciones a clientes"],
              ].map(([name, role]) => (
                <li key={name} className="border-l border-[hsl(var(--border))] pl-4">
                  <div className="font-display text-2xl">{name}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">
                    {role}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="rule" />
      </div>

      {/* ─── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-32">
        <div className="mb-16 grid gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <span className="section-num">03 — Producto</span>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">
              Diseñado para ser{" "}
              <span className="italic">usado todos los días.</span>
            </h2>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-12 md:gap-8">
          {/* Card grande: Org Chart */}
          <FeatureCard
            number="01"
            title="Org chart visual"
            description="Canvas infinito con drag & drop. Departamentos como burbujas anidadas. El que diseñamos es de los más rápidos del mercado, y se sincroniza en tiempo real."
            className="md:col-span-7 md:row-span-2"
            tall
          />
          <FeatureCard
            number="02"
            title="Proyectos y tareas"
            description="Vistas Kanban, lista, calendario. Atajos de teclado en todo. Inspirado en Linear."
            className="md:col-span-5"
          />
          <FeatureCard
            number="03"
            title="Wiki con bloques"
            description="Editor a la altura de Notion. Markdown nativo. Búsqueda instantánea."
            className="md:col-span-5"
          />
          <FeatureCard
            number="04"
            title="CRM ligero"
            description="Contactos, deals y pipelines. Importá desde CSV. Export en cualquier momento."
            className="md:col-span-6"
          />
          <FeatureCard
            number="05"
            title="Multi-tenant nativo"
            description="Una cuenta, varias organizaciones. Permisos granulares. Auth corporativa con SSO en Enterprise."
            className="md:col-span-6"
          />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="rule" />
      </div>

      {/* ─── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-32">
        <div className="mb-16 grid gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <span className="section-num">04 — Precios</span>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">
              Simple.
              <br />
              <span className="italic">Como debe ser.</span>
            </h2>
          </div>
          <div className="md:col-span-5 md:col-start-7 md:pt-6">
            <p className="text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
              Free real. Sin trial que se acaba. Sin tarjeta para empezar. Cuando
              tu equipo crezca, escalá. Cuando no lo necesites, bajá. Sin drama.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {PLAN_LIST.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex flex-col gap-6 border p-8 ${
                plan.highlight
                  ? "border-[hsl(var(--foreground))] bg-[hsl(var(--card))]"
                  : "border-[hsl(var(--border))]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-8 bg-[hsl(var(--foreground))] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--background))]">
                  Recomendado
                </span>
              )}
              <header>
                <span className="section-num">
                  {plan.id === "free" ? "00" : plan.id === "pro" ? "01" : "02"}
                </span>
                <h3 className="mt-3 font-display text-3xl">{plan.name}</h3>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {plan.tagline}
                </p>
              </header>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-5xl">
                    ${(plan.monthlyPrice / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    /mes
                  </span>
                </div>
                {plan.yearlyPrice > 0 && (
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    o ${(plan.yearlyPrice / 100).toFixed(0)}/año (ahorrás ~17%)
                  </p>
                )}
              </div>
              <ul className="flex flex-1 flex-col gap-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--flow-moss))]"
                      strokeWidth={2.5}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={
                  plan.highlight
                    ? "btn-ink w-full justify-center"
                    : "btn-ghost w-full justify-center"
                }
              >
                {plan.id === "free" ? "Empezar gratis" : `Elegir ${plan.name}`}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <div className="rule" />
      </div>

      {/* ─── Manifiesto editorial ────────────────────────────────────── */}
      <section id="manifesto" className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-3">
            <span className="section-num">05 — Manifiesto</span>
          </div>
          <div className="md:col-span-8 md:col-start-5">
            <p className="font-display text-3xl leading-[1.2] md:text-4xl lg:text-5xl">
              Las empresas merecen{" "}
              <span className="italic text-[hsl(var(--flow-rust))]">
                herramientas mejores
              </span>{" "}
              que las que tienen. Una sola, hecha con cuidado, vale por seis
              hechas para que pagues seis suscripciones.
            </p>
            <p className="mt-8 text-base text-[hsl(var(--muted-foreground))]">
              — Equipo FlowOS, Buenos Aires
            </p>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-[hsl(var(--border))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 text-sm text-[hsl(var(--muted-foreground))] md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl text-[hsl(var(--foreground))]">
              FlowOS
            </span>
            <span className="section-num">© 2026</span>
          </div>
          <div className="flex gap-6">
            <Link href="/sign-in" className="hover:text-[hsl(var(--foreground))]">
              Ingresar
            </Link>
            <Link href="/sign-up" className="hover:text-[hsl(var(--foreground))]">
              Crear cuenta
            </Link>
            <Link href="#pricing" className="hover:text-[hsl(var(--foreground))]">
              Precios
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ─── Sub-componente: feature card editorial ─────────────────────────

function FeatureCard({
  number,
  title,
  description,
  className = "",
  tall = false,
}: {
  number: string;
  title: string;
  description: string;
  className?: string;
  tall?: boolean;
}) {
  return (
    <article
      className={`group relative flex flex-col justify-between border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 transition-colors hover:border-[hsl(var(--foreground)/0.4)] ${
        tall ? "min-h-[420px]" : "min-h-[220px]"
      } ${className}`}
    >
      <header className="flex items-start justify-between">
        <span className="section-num">{number}</span>
        <span className="opacity-0 transition-opacity group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
        </span>
      </header>
      <div>
        <h3 className="font-display text-3xl leading-tight md:text-4xl">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          {description}
        </p>
      </div>
    </article>
  );
}
