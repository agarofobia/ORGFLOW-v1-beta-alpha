import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { ThemeBridge } from "@/components/theme-bridge";
import "../styles/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
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
          colorPrimary: "#3D7EFF",
          colorBackground: "#0E1220",
          colorText: "#E2E8F8",
          colorTextSecondary: "#7A8BAD",
          colorInputBackground: "#141928",
          colorInputText: "#E2E8F8",
          colorNeutral: "#7A8BAD",
          borderRadius: "0.5rem",
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        },
        elements: {
          card: "shadow-none border border-[#1E2540] bg-[#0E1220]",
          formButtonPrimary:
            "bg-[#3D7EFF] hover:bg-[#5a93ff] text-white shadow-[0_0_20px_rgba(61,126,255,0.35)]",
          socialButtonsBlockButton:
            "border-[#1E2540] bg-[#141928] text-[#E2E8F8] hover:bg-[#1A2035]",
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
