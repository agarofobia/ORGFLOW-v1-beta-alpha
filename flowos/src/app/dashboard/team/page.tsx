"use client";

import { OrganizationProfile } from "@clerk/nextjs";

export default function TeamPage() {
  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <p
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "var(--c-text-muted)" }}
        >
          Personas
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--c-text-primary)" }}>
          Equipo
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--c-text-muted)" }}>
          Invitá miembros, asigná roles y gestioná las membresías de tu organización.
        </p>
      </div>

      <div style={{ height: "1px", background: "var(--c-border)", marginBottom: "24px" }} />

      <OrganizationProfile
        routing="hash"
        appearance={{
          variables: {
            colorPrimary: "var(--c-accent-blue)",
            colorBackground: "var(--c-bg-surface)",
            colorText: "var(--c-text-primary)",
            colorTextSecondary: "var(--c-text-muted)",
            colorInputBackground: "var(--c-bg-elevated)",
            colorNeutral: "var(--c-text-muted)",
            borderRadius: "0.5rem",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          },
          elements: {
            rootBox: "w-full",
            card: "shadow-none border border-[var(--c-border)] bg-[var(--c-bg-surface)]",
            // navbar visible: Clerk lo necesita para que el usuario pueda
            // navegar entre Miembros / Settings / Invitaciones. Sin navbar
            // queda solo el header sin contenido.
            scrollBox: "bg-transparent",
            formButtonPrimary:
              "bg-[var(--c-accent-blue)] hover:bg-[#5a93ff] text-white shadow-[0_0_16px_rgb(var(--c-accent-blue-rgb) / 0.35)]",
            headerTitle: "text-[var(--c-text-primary)]",
            headerSubtitle: "text-[var(--c-text-muted)]",
          },
        }}
      />
    </div>
  );
}
