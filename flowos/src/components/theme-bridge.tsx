"use client";

import { useEffect } from "react";

/**
 * Reads user theme/accent preferences from localStorage and applies them
 * to <html> on every page load. Listens to "storage" events so changes in
 * Settings reflect immediately.
 */
export function ThemeBridge() {
  useEffect(() => {
    const apply = () => {
      const theme = (localStorage.getItem("flowos-theme") || "dark") as "dark" | "light" | "system";
      const accent = localStorage.getItem("flowos-accent") || "#3D7EFF";
      const root = document.documentElement;

      // Theme class
      root.classList.remove("dark", "light");
      if (theme === "dark") root.classList.add("dark");
      else if (theme === "light") root.classList.add("light");
      else {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.add(prefersDark ? "dark" : "light");
      }

      // Accent color
      root.style.setProperty("--app-accent", accent);
      const rgb = hexToRgbStr(accent);
      if (rgb) root.style.setProperty("--app-accent-rgb", rgb);
    };

    apply();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "flowos-theme" || e.key === "flowos-accent") apply();
    };
    const onCustom = () => apply();
    window.addEventListener("storage", onStorage);
    window.addEventListener("flowos-theme-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("flowos-theme-changed", onCustom);
    };
  }, []);

  return null;
}

function hexToRgbStr(hex: string): string | null {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
