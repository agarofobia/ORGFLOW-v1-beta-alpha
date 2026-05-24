// Hook cliente para leer el PermissionsMap efectivo del usuario actual.
// Cachea el resultado en sessionStorage para evitar re-fetch entre páginas.
// Cualquier check destructivo debe replicarse server-side (no confiar en UI).

"use client";

import { useEffect, useState } from "react";
import type { PermissionsMap, Module, Action } from "@/lib/permissions";

const CACHE_KEY = "flowos-permissions";

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hidratar de sessionStorage primero (UX más rápida)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setPermissions(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}

    // Refresh siempre, por si cambiaron permisos
    fetch("/api/permissions/me")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        const map = (data && typeof data === "object" && !("error" in data) ? data : {}) as PermissionsMap;
        setPermissions(map);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(map));
        } catch {}
      })
      .catch(() => setPermissions({}))
      .finally(() => setLoading(false));
  }, []);

  function can(module: Module, action: Action): boolean {
    return permissions?.[module]?.[action] === true;
  }

  return { permissions, loading, can };
}
