import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-[hsl(var(--flow-rust))] p-10 text-[hsl(var(--background))] md:flex">
        <Link href="/" className="font-display text-3xl tracking-tight">
          FlowOS
        </Link>
        <div>
          <p className="font-display text-4xl leading-tight">
            Empezás con el plan{" "}
            <span className="italic">Free para siempre</span>. Sin tarjeta. Sin
            trial que te corre.
          </p>
          <p className="mt-6 text-sm opacity-70">
            Hasta 5 miembros. Acceso a todos los módulos. Cuando crezcas, escalás.
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] opacity-60">
          VOL. 01 — Crear cuenta
        </div>
      </aside>

      <section className="flex flex-col items-center justify-center bg-[hsl(var(--background))] p-6 grain">
        <div className="mb-8 md:hidden">
          <Link href="/" className="font-display text-3xl tracking-tight">
            FlowOS
          </Link>
        </div>
        <SignUp
          forceRedirectUrl="/onboarding"
          signInUrl="/sign-in"
          appearance={{
            elements: {
              rootBox: "w-full max-w-sm",
              card: "shadow-none border-none bg-transparent",
            },
          }}
        />
      </section>
    </main>
  );
}
