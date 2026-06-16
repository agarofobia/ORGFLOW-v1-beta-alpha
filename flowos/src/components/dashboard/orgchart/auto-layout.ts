// Auto-layout del organigrama con dagre. Función PURA: recibe el estado y devuelve las
// nuevas posiciones/tamaños; la persistencia (fetch en lotes) + setState la hace el
// componente. Extraído de orgchart-canvas.tsx.

import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";
import type { Division, Department } from "./types";

export type AutoLayoutResult = {
  newDivPositions: Map<string, { x: number; y: number }>;
  newDeptPositions: Map<string, { x: number; y: number }>;
  newDeptSizes: Map<string, number>;
  newSecPositions: Map<string, { x: number; y: number }>;
};

export function computeAutoLayout(
  divisions: Division[],
  departments: Department[],
  edges: Edge[],
  coupledSizes: Map<string, { w: number; h: number }>,
  manualSizeDivs: Set<string>,
): AutoLayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 120, marginx: 50, marginy: 50 });

  // Group coupled divisions — treat each coupling group as a single dagre node
  const couplingGroups = new Map<string, Division[]>();
  const standaloneDivs: Division[] = [];
  divisions.forEach(d => {
    if (d.couplingGroup) {
      const arr = couplingGroups.get(d.couplingGroup) ?? [];
      arr.push(d);
      couplingGroups.set(d.couplingGroup, arr);
    } else {
      standaloneDivs.push(d);
    }
  });

  // Standalone divisions → individual dagre nodes
  standaloneDivs.forEach(d => {
    const sz = coupledSizes.get(d.id) ?? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 };
    g.setNode(d.id, { width: sz.w, height: sz.h });
  });

  // Coupling groups → one dagre node each (combined width, max height)
  couplingGroups.forEach((group, groupKey) => {
    const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    const totalW = sorted.reduce((sum, d) => sum + (coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720), 0);
    const maxH = Math.max(...sorted.map(d => coupledSizes.get(d.id)?.h ?? d.sizeHeight ?? 500));
    g.setNode(`__group_${groupKey}`, { width: totalW, height: maxH });
  });

  // Map division ID → dagre node ID (handles coupling)
  const getDagreId = (divId: string): string | null => {
    const div = divisions.find(d => d.id === divId);
    if (!div) return null;
    return div.couplingGroup ? `__group_${div.couplingGroup}` : divId;
  };

  // Add edges between divisions
  edges.forEach(e => {
    const src = getDagreId(e.source);
    const tgt = getDagreId(e.target);
    if (src && tgt && src !== tgt && g.hasNode(src) && g.hasNode(tgt)) {
      g.setEdge(src, tgt);
    }
  });

  dagre.layout(g);

  const newDivPositions = new Map<string, { x: number; y: number }>();

  standaloneDivs.forEach(d => {
    const n = g.node(d.id);
    if (!n) return;
    const sz = coupledSizes.get(d.id) ?? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 };
    newDivPositions.set(d.id, { x: n.x - sz.w / 2, y: n.y - sz.h / 2 });
  });

  couplingGroups.forEach((group, groupKey) => {
    const n = g.node(`__group_${groupKey}`);
    if (!n) return;
    const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    const totalW = sorted.reduce((sum, d) => sum + (coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720), 0);
    const maxH = Math.max(...sorted.map(d => coupledSizes.get(d.id)?.h ?? d.sizeHeight ?? 500));
    let cumX = n.x - totalW / 2;
    const baseY = n.y - maxH / 2;
    sorted.forEach(d => {
      const dw = coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720;
      newDivPositions.set(d.id, { x: cumX, y: baseY });
      cumX += dw;
    });
  });

  // Re-layout departments within each division:
  //   • Equal width — each dept gets (divWidth - 2*PAD) / numDepts
  //   • Fused (0 gap) — depts touch each other, snapped
  //   • Centered horizontally within the division
  //   • Y starts BELOW the secretary card (if the division has a senior employee)
  // Also: the secretary employee is centered at the top of the content area.
  const HDR_Y = 80; const PAD = 16;
  const SEC_CARD_H = 70; const SEC_GAP = 16;
  const newDeptPositions = new Map<string, { x: number; y: number }>();
  const newDeptSizes    = new Map<string, number>();           // sizeWidth per dept
  const newSecPositions = new Map<string, { x: number; y: number }>(); // secretary employees

  divisions.forEach(div => {
    // Width to use: manual size takes precedence over auto-computed
    const divW = manualSizeDivs.has(div.id)
      ? (div.sizeWidth ?? 720)
      : (coupledSizes.get(div.id)?.w ?? div.sizeWidth ?? 720);

    // Secretary: center it at top of content area
    if (div.seniorEmployeeId) {
      const EMP_CARD_W = 200;
      newSecPositions.set(div.seniorEmployeeId, {
        x: Math.max(PAD, Math.round((divW - EMP_CARD_W) / 2)),
        y: HDR_Y,
      });
    }

    const divDepts = departments.filter(dp => dp.divisionId === div.id);
    if (divDepts.length === 0) return;

    // Equal width: fill available width, fused (no gap between adjacent depts)
    const availW = divW - 2 * PAD;
    const equalW = Math.max(180, Math.floor(availW / divDepts.length));
    const totalGroupW = equalW * divDepts.length;
    const startX = Math.max(PAD, Math.round((divW - totalGroupW) / 2));

    // Y: leave room for secretary if present
    const deptY = div.seniorEmployeeId
      ? HDR_Y + SEC_CARD_H + SEC_GAP
      : HDR_Y;

    let cumX = startX;
    divDepts.forEach(dept => {
      newDeptPositions.set(dept.id, { x: cumX, y: deptY });
      newDeptSizes.set(dept.id, equalW);
      cumX += equalW; // 0 gap → adjacent depts fuse automatically
    });
  });

  return { newDivPositions, newDeptPositions, newDeptSizes, newSecPositions };
}
