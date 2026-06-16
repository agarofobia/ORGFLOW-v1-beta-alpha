// Snap (imán) del organigrama — funciones PURAS.
//
// Al soltar una división/departamento cerca de otro del mismo nivel, se calcula la
// posición "pegada" borde-con-borde. Extraído de `orgchart-canvas.tsx` para testear
// las tolerancias y el orden de prioridad de los candidatos.

import type { Division, Department } from "./types";

// ─── Snap entre divisiones ────────────────────────────────────────────────────
// Devuelve { x, y, couplingGroup, anchorId } si corresponde acoplar, o null.
export function computeDivisionSnap(
  draggedId: string,
  dragX: number,
  dragY: number,
  divisions: Division[],
  coupledSizes: Map<string, { w: number; h: number }>,
  coupledGroupPositions: Map<string, { x: number; y: number }>,
): { x: number; y: number; couplingGroup: string; anchorId: string } | null {
  const dragged = divisions.find(d => d.id === draggedId);
  if (!dragged) return null;
  const dragSize = coupledSizes.get(draggedId) ?? { w: dragged.sizeWidth ?? 720, h: dragged.sizeHeight ?? 500 };
  const SNAP_PX = 80;
  const Y_TOLERANCE = 100;

  for (const other of divisions) {
    if (other.id === draggedId) continue;
    // Usar la posición VISUAL (lo que el usuario ve). Para divisiones acopladas,
    // la posición real viene de coupledGroupPositions, no de positionX.
    const visual = coupledGroupPositions.get(other.id);
    const oX = visual?.x ?? other.positionX ?? 0;
    const oY = visual?.y ?? other.positionY ?? 0;
    const oSize = coupledSizes.get(other.id) ?? { w: other.sizeWidth ?? 720, h: other.sizeHeight ?? 500 };
    const yClose = Math.abs(dragY - oY) < Y_TOLERANCE;

    // Drop a la derecha de `other`
    if (yClose && Math.abs(dragX - (oX + oSize.w)) < SNAP_PX) {
      return { x: oX + oSize.w, y: oY, couplingGroup: other.couplingGroup ?? other.id, anchorId: other.id };
    }
    // Drop a la izquierda de `other` — alinea dragged.right con other.left
    if (yClose && Math.abs((dragX + dragSize.w) - oX) < SNAP_PX) {
      return { x: oX - dragSize.w, y: oY, couplingGroup: other.couplingGroup ?? other.id, anchorId: other.id };
    }
  }
  return null;
}

// ─── Snap entre departamentos del MISMO division ──────────────────────────────
// Los pega borde-con-borde igual que divisiones. No usa couplingGroup (no existe esa
// columna en depts); solo alinea X y Y. Devuelve la posición pegada o null.
export function computeDepartmentSnap(
  draggedId: string,
  dragX: number,
  dragY: number,
  departments: Department[],
): { x: number; y: number } | null {
  const dragged = departments.find(d => d.id === draggedId);
  if (!dragged || !dragged.divisionId) return null;
  const dragW = dragged.sizeWidth ?? 280;
  const SNAP_PX = 40;
  const Y_TOL = 22;

  let bestSnap: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  for (const other of departments) {
    if (other.id === draggedId) continue;
    if (other.divisionId !== dragged.divisionId) continue; // sólo dentro de la misma división
    const oX = other.positionX ?? 0;
    const oY = other.positionY ?? 0;
    const oW = other.sizeWidth ?? 280;
    const yClose = Math.abs(dragY - oY) < Y_TOL;
    if (!yClose) continue;

    // Caso 1: SOLAPAMIENTO — resolver por centro relativo.
    const overlapsX = dragX < oX + oW && dragX + dragW > oX;
    if (overlapsX) {
      const dragCenter = dragX + dragW / 2;
      const otherCenter = oX + oW / 2;
      const snapX = dragCenter > otherCenter ? oX + oW : oX - dragW;
      const dist = Math.abs(dragX - snapX);
      if (dist < bestDist) { bestDist = dist; bestSnap = { x: snapX, y: oY }; }
      continue;
    }

    // Caso 2: CERCA sin solapar — snap al candidato más cercano dentro de SNAP_PX
    const distRight = Math.abs(dragX - (oX + oW));       // dragged a la derecha de other
    const distLeft  = Math.abs((dragX + dragW) - oX);    // dragged a la izquierda de other
    if (distRight < SNAP_PX && distRight < bestDist) {
      bestDist = distRight; bestSnap = { x: oX + oW, y: oY };
    }
    if (distLeft < SNAP_PX && distLeft < bestDist) {
      bestDist = distLeft; bestSnap = { x: oX - dragW, y: oY };
    }
  }
  return bestSnap;
}
