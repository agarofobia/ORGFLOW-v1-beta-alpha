import { OrganizationList } from "@clerk/nextjs";
import Link from "next/link";

export default function SelectOrgPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--background))] grain">
      <nav className="mx-auto max-w-7xl px-6 pt-6 md:px-10 md:pt-8">
        <Link href="/" className="font-display text-3xl tracking-tight">
          FlowOS
        </Link>
      </nav>
      <section className="mx-auto max-w-2xl px-6 py-16 md:px-10 md:py-24">
        <span className="section-num">Elegí tu espacio</span>
        <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
          ¿En cuál estás{" "}
          <span className="italic text-[hsl(var(--flow-ochre))]">trabajando</span>{" "}
          hoy?
        </h1>
        <div className="mt-12">
          <OrganizationList
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border border-[hsl(var(--border))]",
              },
            }}
          />
        </div>
      </section>
    </main>
  );
}
