// Capa de datos del orgchart: estado de divisions/departments/units/edges, su carga
// inicial resiliente, los refs estables que leen los callbacks de drag/resize, y la
// persistencia de edges. Extraído de orgchart-canvas.tsx.
//
// Las mutaciones puntuales (crear/borrar/editar) siguen en el componente usando los
// setters que devuelve este hook — acá vive el "store" (estado + carga + refs).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import type { Unit } from "@/db/schema";
import type { Division, Department } from "./types";

export function useOrgChartData() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Refs estables: los callbacks de drag/resize leen datos frescos sin recrearse.
  const divisionsRef = useRef<Division[]>([]);
  const departmentsRef = useRef<Department[]>([]);
  const unitsRef = useRef<Unit[]>([]);

  // ── Load divisions, departments, units, edges ────────────────────────────
  // RESILIENCIA: si un fetch falla (500 cold-start, red, etc.) devolvemos `null`
  // (NO `[]`). Un `null` significa "no pude cargar" → preservamos el estado previo.
  // Sin esto, un 500 transitorio en /api/departments dejaba `departments = []` y
  // los empleados se apilaban en la división sin su contenedor → orgchart roto.
  const reloadGroups = useCallback(async () => {
    const safeFetch = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        return (await r.json()) as T;
      } catch {
        return null;
      }
    };
    const [d, dp, u, edgesRes] = await Promise.all([
      safeFetch<Division[]>("/api/divisions"),
      safeFetch<Department[]>("/api/departments"),
      safeFetch<Unit[]>("/api/units"),
      safeFetch<{ edges: Edge[] }>("/api/orgchart/state"),
    ]);
    // Solo actualizamos cada slice si su fetch tuvo éxito (Array válido).
    // Si falló (null), mantenemos lo que ya había en pantalla.
    if (Array.isArray(d)) setDivisions(d);
    if (Array.isArray(dp)) setDepartments(dp);
    if (Array.isArray(u)) setUnits(u);
    if (edgesRes && Array.isArray(edgesRes.edges)) {
      setEdges(edgesRes.edges.map((e: Edge) => ({ ...e, type: "bicolor" })));
    }
  }, []);

  useEffect(() => { reloadGroups(); }, [reloadGroups]);
  useEffect(() => { divisionsRef.current = divisions; }, [divisions]);
  useEffect(() => { departmentsRef.current = departments; }, [departments]);
  useEffect(() => { unitsRef.current = units; }, [units]);

  // ── Persistir edges ──
  const saveEdges = useCallback(async (edgesToSave: Edge[]) => {
    await fetch("/api/orgchart/state", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edges: edgesToSave }),
    }).catch(() => {});
  }, []);

  return {
    divisions, setDivisions,
    departments, setDepartments,
    units, setUnits,
    edges, setEdges,
    divisionsRef, departmentsRef, unitsRef,
    reloadGroups, saveEdges,
  };
}
