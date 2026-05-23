"use client";

// <Popover> — wrapper común para dropdowns/pickers.
// Maneja:
//   - Position absolute top 100% (default)
//   - Click outside → onClose
//   - Esc → onClose
//   - Estilos consistentes (bg, border, shadow, radius)
//
// Los pickers específicos (employee, milestone, status, etc) solo proveen el
// contenido. La estructura + dismiss lógica vive acá.

import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

interface PopoverProps {
  onClose: () => void;
  /** Width del popover. Default 240. Puede ser numero o string ("auto", etc). */
  width?: number | string;
  /** Max height del scroll interior. Default 280. */
  maxHeight?: number;
  /** Posición del top. Default "100%" (justo debajo del anchor). */
  top?: number | string;
  /** Posición del left. Default 0. */
  left?: number | string;
  /** Estilos custom adicionales. */
  style?: CSSProperties;
  children: ReactNode;
}

export function Popover({
  onClose,
  width = 240,
  maxHeight = 280,
  top = "100%",
  left = 0,
  style,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Click outside dismiss
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Esc dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top,
        left,
        marginTop: 4,
        zIndex: 100,
        background: "#0E1220",
        border: "1px solid #1E2540",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        width,
        maxHeight,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Estilo común para botones de opción dentro de un Popover.
// Se usa con un wrapper que setea active state + onClick.
export const popoverOptionStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "7px 12px",
  background: active ? "rgba(61,126,255,0.1)" : "transparent",
  border: "none",
  borderLeft: active ? "2px solid #3D7EFF" : "2px solid transparent",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 12,
  color: "#E2E8F8",
});

// Handlers de hover para opciones — replica el highlight original.
export function popoverOptionHover(active: boolean) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = "#1E2540";
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = active ? "rgba(61,126,255,0.1)" : "transparent";
    },
  };
}
