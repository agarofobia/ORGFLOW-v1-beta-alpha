"use client";

import { OrganizationProfile } from "@clerk/nextjs";

export default function TeamPage() {
  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <p
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "#7A8BAD" }}
        >
          Personas
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "#E2E8F8" }}>
          Equipo
        </h2>
        <p className="mt-1 text-sm" style={{ color: "#7A8BAD" }}>
          Invitá miembros, asigná roles y gestioná las membresías de tu organización.
        </p>
      </div>

      <div style={{ height: "1px", background: "#1E2540", marginBottom: "24px" }} />

      <OrganizationProfile
        routing="hash"
        appearance={{
          variables: {
            colorPrimary: "#3D7EFF",
            colorBackground: "#0E1220",
            colorText: "#E2E8F8",
            colorTextSecondary: "#7A8BAD",
            colorInputBackground: "#141928",
            colorNeutral: "#7A8BAD",
            borderRadius: "0.5rem",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          },
          elements: {
            rootBox: "w-full",
            card: "shadow-none border border-[#1E2540] bg-[#0E1220]",
            // navbar visible: Clerk lo necesita para que el usuario pueda
            // navegar entre Miembros / Settings / Invitaciones. Sin navbar
            // queda solo el header sin contenido.
            scrollBox: "bg-transparent",
            formButtonPrimary:
              "bg-[#3D7EFF] hover:bg-[#5a93ff] text-white shadow-[0_0_16px_rgba(61,126,255,0.35)]",
            headerTitle: "text-[#E2E8F8]",
            headerSubtitle: "text-[#7A8BAD]",
          },
        }}
      />
    </div>
  );
}
