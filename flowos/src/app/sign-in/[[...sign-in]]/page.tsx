import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* Lado editorial — solo en desktop */}
      <aside className="relative hidden flex-col justify-between bg-[hsl(var(--foreground))] p-10 text-[hsl(var(--background))] md:flex">
        <Link href="/" className="font-display text-3xl tracking-tight">
          FlowOS
        </Link>
        <div>
          <p className="font-display text-4xl leading-tight">
            &ldquo;Volver al laburo es{" "}
            <span className="italic">tan importante</span> como volver a casa.&rdquo;
          </p>
          <p className="mt-6 text-sm opacity-60">— Una persona razonable</p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] opacity-50">
          VOL. 01 — Ingreso
        </div>
      </aside>

      {/* Form de Clerk */}
      <section className="flex flex-col items-center justify-center bg-[hsl(var(--background))] p-6 grain">
        <div className="mb-8 md:hidden">
          <Link href="/" className="font-display text-3xl tracking-tight">
            FlowOS
          </Link>
        </div>
        <SignIn
          forceRedirectUrl="/select-org"
          signUpUrl="/sign-up"
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
