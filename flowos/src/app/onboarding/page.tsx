import { CreateOrganization } from "@clerk/nextjs";
import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--background))] grain">
      <nav className="mx-auto max-w-7xl px-6 pt-6 md:px-10 md:pt-8">
        <Link href="/" className="font-display text-3xl tracking-tight">
          FlowOS
        </Link>
      </nav>
      <section className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-24">
        <span className="section-num">PASO 1 — Crear organización</span>
        <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
          Empezá por darle un{" "}
          <span className="italic text-[hsl(var(--flow-rust))]">nombre</span>.
        </h1>
        <p className="mt-6 max-w-xl text-base text-[hsl(var(--muted-foreground))]">
          Tu organización es el espacio compartido del equipo. Después podés
          invitar a más gente, configurar permisos y arrancar a usar los módulos.
        </p>

        <div className="mt-12">
          <CreateOrganization
            afterCreateOrganizationUrl="/dashboard"
            skipInvitationScreen
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border border-[hsl(var(--border))] p-8",
              },
            }}
          />
        </div>
      </section>
    </main>
  );
}
