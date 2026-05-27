import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { ThemeBridge } from "@/components/theme-bridge";
import "../styles/globals.css";

const dmSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = JetBrains_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FlowOS — el sistema operativo de tu empresa",
  description:
    "Org chart, proyectos, wiki y CRM. Una sola herramienta. Una sola fuente de verdad.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://flowos.vercel.app",
  ),
};

// viewport-fit=cover habilita env(safe-area-inset-*) en iOS Safari.
// Sin esto el botón del chat queda detrás del home indicator del iPhone.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      localization={esES}
      appearance={{
        variables: {
          colorPrimary: "var(--c-accent-blue)",
          colorBackground: "var(--c-bg-surface)",
          colorText: "var(--c-text-primary)",
          colorTextSecondary: "var(--c-text-muted)",
          colorInputBackground: "var(--c-bg-elevated)",
          colorInputText: "var(--c-text-primary)",
          colorNeutral: "var(--c-text-muted)",
          borderRadius: "0.5rem",
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        },
        elements: {
          card: "shadow-none border border-[var(--c-border)] bg-[var(--c-bg-surface)]",
          formButtonPrimary:
            "bg-[var(--c-accent-blue)] hover:bg-[#5a93ff] text-white shadow-[0_0_20px_rgb(var(--c-accent-blue-rgb) / 0.35)]",
          socialButtonsBlockButton:
            "border-[var(--c-border)] bg-[var(--c-bg-elevated)] text-[var(--c-text-primary)] hover:bg-[var(--c-bg-overlay)]",
        },
      }}
    >
      <html
        lang="es"
        className={`${dmSans.variable} ${dmMono.variable}`}
        suppressHydrationWarning
      >
        {/* ThemeScript: aplica el tema guardado antes del primer paint para evitar flash */}
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('flowos-theme');var a=localStorage.getItem('flowos-accent');var r=document.documentElement;if(t==='light'){r.classList.add('light');}else if(t==='system'){if(!window.matchMedia('(prefers-color-scheme: dark)').matches){r.classList.add('light');}else{r.classList.add('dark');}}else{r.classList.add('dark');}if(a){r.style.setProperty('--app-accent',a);}}catch(e){}})();`,
            }}
          />
        </head>
        <body className="font-sans antialiased">
          <ThemeBridge />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
