// Toggles del orgchart persistidos en localStorage (clave `flowos-orgchart-<key>`).
// Cada setter persiste el valor; el read inicial cae al default si no hay nada guardado.
// Extraído de orgchart-canvas.tsx.

import { useCallback, useState } from "react";

function readToggle(key: string, defaultOn: boolean): boolean {
  if (typeof window === "undefined") return defaultOn;
  const v = localStorage.getItem(`flowos-orgchart-${key}`);
  if (v === null) return defaultOn;
  return v === "true";
}

function usePersistentToggle(key: string, defaultOn: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => readToggle(key, defaultOn));
  const set = useCallback((v: boolean) => {
    setValue(v);
    try { localStorage.setItem(`flowos-orgchart-${key}`, String(v)); } catch { /* ignore */ }
  }, [key]);
  return [value, set];
}

export function useOrgChartToggles() {
  // globalConnectable / linkedResize: default ON. showRoleBadges / locked: default OFF.
  const [globalConnectable, setGlobalConnectable] = usePersistentToggle("global-connectable", true);
  const [linkedResize, setLinkedResize] = usePersistentToggle("linked-resize", true);
  const [showRoleBadges, setShowRoleBadges] = usePersistentToggle("show-badges", false);
  const [locked, setLocked] = usePersistentToggle("locked", false);
  return {
    globalConnectable, setGlobalConnectable,
    linkedResize, setLinkedResize,
    showRoleBadges, setShowRoleBadges,
    locked, setLocked,
  };
}
