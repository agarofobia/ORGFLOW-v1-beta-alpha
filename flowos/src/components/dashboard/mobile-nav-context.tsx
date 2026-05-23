"use client";

// Mobile nav state — compartido entre sidebar y topbar para que el botón
// hamburger del topbar pueda abrir/cerrar el sidebar overlay.
// En desktop (>= 768px) el sidebar siempre está visible, este state no se usa.

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface MobileNavCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<MobileNavCtx | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el sidebar al navegar a otra ruta (mobile UX estándar)
  useEffect(() => { setOpen(false); }, [pathname]);

  // Bloquear scroll del body cuando el sidebar está abierto en mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // Esc cierra el sidebar
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle: () => setOpen(v => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMobileNav debe usarse dentro de MobileNavProvider");
  return ctx;
}
