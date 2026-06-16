// Motor de layout del organigrama — funciones PURAS (sin estado React ni IO).
//
// Extraído de `orgchart-canvas.tsx` para ser testeable y legible. Cada función recibe
// las entidades por parámetro y devuelve el resultado del cálculo geométrico/jerárquico.
// El componente las envuelve en useMemo para memoizar; la lógica vive acá.

import type { Edge } from "@xyflow/react";
import type { Employee, Unit } from "@/db/schema";
import type { Division, Department, AnyNode, EmployeeNode, DepartmentNode } from "./types";
import { getEffectiveRole } from "./roles";
import { LAYOUT } from "./constants";

const { HEADER_H, FOOTER_H_ON, PADDING, DEPT_W, DEPT_H, EMP_W, EMP_H, EMP_GAP } = LAYOUT;

// ─── Tamaño natural de una división ───────────────────────────────────────────
// Calcula el tamaño que NECESITA una división según sus hijos (depts + empleados
// directos). Proporcional de verdad: vacía = chica, llena = grande.
export function computeDivisionNaturalSize(
  d: Division,
  departments: Department[],
  employees: Employee[],
): { w: number; h: number } {
  const childDepts = departments.filter(x => x.divisionId === d.id);
  const directEmps = (employees ?? []).filter(e => e.divisionId === d.id && !e.departmentId);
  const footerH = d.showFooter ? FOOTER_H_ON : 0;

  if (childDepts.length === 0 && directEmps.length === 0) {
    return { w: 320, h: HEADER_H + 60 + footerH };
  }

  let maxChildX = 0;
  let maxChildY = 0;
  const heights: number[] = [];
  childDepts.forEach(dept => {
    const isHeadPromoted = (dept.promoteHead ?? false) && !!dept.headEmployeeId;
    const empCount = (employees ?? []).filter(e =>
      e.departmentId === dept.id &&
      (!isHeadPromoted || e.id !== dept.headEmployeeId)
    ).length;
    const mode = dept.layoutMode ?? "vertical";
    const step = mode === "compact" ? (44 + 6) : (EMP_H + EMP_GAP);
    const needed = 34 + 12 + empCount * step + 16;
    heights.push(Math.max(dept.sizeHeight ?? DEPT_H, needed));
  });
  const maxDeptH = heights.length > 0 ? Math.max(...heights) : DEPT_H;
  childDepts.forEach(dept => {
    const dW = Math.max(dept.sizeWidth ?? DEPT_W, 290);
    const x = (dept.positionX ?? PADDING) + dW;
    const y = (dept.positionY ?? HEADER_H + PADDING) + maxDeptH;
    if (x > maxChildX) maxChildX = x;
    if (y > maxChildY) maxChildY = y;
  });
  directEmps.forEach(emp => {
    const x = (emp.positionX ?? PADDING) + EMP_W;
    const y = (emp.positionY ?? HEADER_H + PADDING) + EMP_H;
    if (x > maxChildX) maxChildX = x;
    if (y > maxChildY) maxChildY = y;
  });

  const w = Math.max(320, maxChildX + PADDING);
  const h = Math.max(HEADER_H + 80, maxChildY + PADDING) + footerH;
  return { w, h };
}

// ─── Tamaños de divisiones acopladas ──────────────────────────────────────────
// Las del mismo coupling group comparten max(naturalSize) para verse simétricas.
// Las solo (sin grupo) usan su tamaño natural directo.
export function computeCoupledSizes(
  divisions: Division[],
  departments: Department[],
  employees: Employee[],
): Map<string, { w: number; h: number }> {
  const sizes = new Map<string, { w: number; h: number }>();
  const groups = new Map<string, Division[]>();
  divisions.forEach(d => {
    const key = d.couplingGroup ?? `solo:${d.id}`;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  });
  groups.forEach((group, key) => {
    if (key.startsWith("solo:")) {
      const d = group[0];
      sizes.set(d.id, computeDivisionNaturalSize(d, departments, employees));
    } else {
      let maxW = 0, maxH = 0;
      group.forEach(d => {
        const nat = computeDivisionNaturalSize(d, departments, employees);
        maxW = Math.max(maxW, nat.w);
        maxH = Math.max(maxH, nat.h);
      });
      group.forEach(d => sizes.set(d.id, { w: maxW, h: maxH }));
    }
  });
  return sizes;
}

// ─── Adyacencia de divisiones (para el fundido visual) ────────────────────────
// Derivada de couplingGroup + orden de positionX (no de tolerancia de píxeles).
export function computeAdjacency(divisions: Division[]): Map<string, { left: boolean; right: boolean }> {
  const map = new Map<string, { left: boolean; right: boolean }>();
  divisions.forEach(d => map.set(d.id, { left: false, right: false }));
  const groups = new Map<string, Division[]>();
  divisions.forEach(d => {
    if (!d.couplingGroup) return;
    const arr = groups.get(d.couplingGroup) ?? [];
    arr.push(d);
    groups.set(d.couplingGroup, arr);
  });
  groups.forEach(group => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    sorted.forEach((div, i) => {
      map.set(div.id, { left: i > 0, right: i < sorted.length - 1 });
    });
  });
  return map;
}

// ─── Adyacencia de departamentos ──────────────────────────────────────────────
// Dos depts del MISMO division con misma Y y X alineados (borde-con-borde dentro de
// tolerancia) → se ven fusionados. Derivada de posiciones, sin columna en DB.
export function computeDeptAdjacency(departments: Department[]): Map<string, { left: boolean; right: boolean }> {
  const map = new Map<string, { left: boolean; right: boolean }>();
  departments.forEach(d => map.set(d.id, { left: false, right: false }));
  const byDiv = new Map<string, Department[]>();
  departments.forEach(d => {
    if (!d.divisionId) return;
    const arr = byDiv.get(d.divisionId) ?? [];
    arr.push(d);
    byDiv.set(d.divisionId, arr);
  });
  const TOL_X = 4;
  const TOL_Y = 30;
  byDiv.forEach(list => {
    list.forEach(a => {
      const aX = a.positionX ?? 0;
      const aY = a.positionY ?? 0;
      const aW = a.sizeWidth ?? DEPT_W;
      for (const b of list) {
        if (b.id === a.id) continue;
        const bX = b.positionX ?? 0;
        const bY = b.positionY ?? 0;
        if (Math.abs(aY - bY) > TOL_Y) continue;
        if (Math.abs((aX + aW) - bX) < TOL_X) {
          const cur = map.get(a.id) ?? { left: false, right: false };
          map.set(a.id, { left: cur.left, right: true });
          const curB = map.get(b.id) ?? { left: false, right: false };
          map.set(b.id, { left: true, right: curB.right });
        }
      }
    });
  });
  return map;
}

// ─── Posiciones dinámicas de grupos acoplados ─────────────────────────────────
// Cuando una división crece/encoge, los hermanos a la derecha se reacomodan para
// mantener el grupo pegado — sin escribir a DB. Las solo usan su positionX/Y.
export function computeCoupledGroupPositions(
  divisions: Division[],
  coupledSizes: Map<string, { w: number; h: number }>,
  manualSizeDivs: Set<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const groups = new Map<string, Division[]>();
  divisions.forEach(d => {
    if (!d.couplingGroup) return;
    const arr = groups.get(d.couplingGroup) ?? [];
    arr.push(d);
    groups.set(d.couplingGroup, arr);
  });
  // CRÍTICO: cumX debe usar el ancho REAL que se va a renderizar. Si una div está en
  // manualSize, su sizeWidth puede diferir del coupledSizes (que sólo calcula natural).
  const widthFor = (d: Division) => {
    if (manualSizeDivs.has(d.id)) return d.sizeWidth ?? 720;
    return coupledSizes.get(d.id)?.w ?? d.sizeWidth ?? 720;
  };
  groups.forEach(group => {
    const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    let cumX = sorted[0].positionX ?? 0;
    const baseY = sorted[0].positionY ?? 0;
    sorted.forEach(div => {
      positions.set(div.id, { x: cumX, y: baseY });
      cumX += widthFor(div);
    });
  });
  return positions;
}

// ─── Absorción de subordinados ────────────────────────────────────────────────
// Un manager (encargado) cuyos subordinados sean TODOS members → los "absorbe":
// se renderizan inline dentro de su card, no como cards separados.
export type AbsorbedSub = {
  id: string;
  fullName: string;
  jobTitle: string;
  color: string;
  isVacant: boolean;
  imageUrl?: string | null;
  unit?: { id: string; name: string; color: string | null; isHead: boolean } | null;
};
export type Absorption = {
  absorbedIds: Set<string>;
  managerSubsMap: Map<string, AbsorbedSub[]>;
};

export function computeAbsorption(
  employees: Employee[],
  departments: Department[],
  units: Unit[],
): Absorption {
  const absorbedIds = new Set<string>();
  const managerSubsMap = new Map<string, AbsorbedSub[]>();

  const directReports = new Map<string, Employee[]>();
  for (const e of employees ?? []) {
    if (!e.managerId) continue;
    const list = directReports.get(e.managerId) ?? [];
    list.push(e);
    directReports.set(e.managerId, list);
  }

  for (const [mgrId, subs] of directReports.entries()) {
    const mgr = (employees ?? []).find(e => e.id === mgrId);
    if (!mgr) continue;
    const mgrRole = getEffectiveRole(mgr, employees ?? [], departments, units);
    if (mgrRole !== "manager") continue;
    const allMembers = subs.every(s => getEffectiveRole(s, employees ?? [], departments, units) === "member");
    if (!allMembers) continue;
    const list = subs.map(s => {
      const u = s.unitId ? units.find(x => x.id === s.unitId) : null;
      return {
        id: s.id,
        fullName: s.fullName,
        jobTitle: s.jobTitle || "Sin asignar",
        color: s.color || "var(--c-accent-blue)",
        isVacant: s.fullName === "[Puesto vacante]",
        imageUrl: (s as Employee & { imageUrl?: string | null }).imageUrl ?? null,
        unit: u ? { id: u.id, name: u.name, color: u.color, isHead: u.headEmployeeId === s.id } : null,
      };
    });
    managerSubsMap.set(mgrId, list);
    subs.forEach(s => absorbedIds.add(s.id));
  }

  return { absorbedIds, managerSubsMap };
}

// ─── Set de IDs de heads de departamento ──────────────────────────────────────
export function computeDeptHeadIds(departments: Department[]): Set<string> {
  const s = new Set<string>();
  for (const dp of departments) {
    if (dp.headEmployeeId) s.add(dp.headEmployeeId);
  }
  return s;
}

// ─── Layout interno por departamento ──────────────────────────────────────────
// Posiciona los empleados dentro de cada depto según layoutMode:
//   - "vertical": stack con indent por nivel (default)
//   - "compact": stack sin indent, gap menor
//   - "manual": no auto-posiciona (respeta el drag del usuario)
// El head/director siempre va arriba del todo.
export function computeDeptInternalLayout(
  departments: Department[],
  employees: Employee[],
  absorbedIds: Set<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const COL_X = 16;
  const TOP_Y = 34 + 12;

  departments.forEach(dept => {
    const mode = dept.layoutMode ?? "vertical";
    if (mode === "manual") return; // no auto-posiciona — drag manual rules

    const empsInDept = (employees ?? []).filter(e =>
      e.departmentId === dept.id &&
      !absorbedIds.has(e.id) &&
      e.manualPosition !== true
    );
    if (empsInDept.length === 0) return;

    const STEP = mode === "compact" ? (44 + 6) : (70 + 12); // EMP_H + EMP_GAP
    const INDENT = mode === "compact" ? 0 : 20;

    const visited = new Set<string>();
    let y = TOP_Y;
    const place = (empId: string, depth: number = 0) => {
      if (visited.has(empId)) return;
      const emp = empsInDept.find(e => e.id === empId);
      if (!emp) return;
      visited.add(empId);
      positions.set(empId, { x: COL_X + depth * INDENT, y });
      y += STEP;
      empsInDept
        .filter(e => e.managerId === empId)
        .forEach(sub => place(sub.id, depth + 1));
    };

    if (dept.headEmployeeId && empsInDept.some(e => e.id === dept.headEmployeeId)) {
      place(dept.headEmployeeId, 0);
    }
    empsInDept
      .filter(e => (!e.managerId || !empsInDept.some(m => m.id === e.managerId)) && !visited.has(e.id))
      .forEach(e => place(e.id, 0));
    empsInDept.forEach(e => { if (!visited.has(e.id)) place(e.id, 0); });
  });

  return positions;
}

// ─── Edges sintéticas (jerarquía auto-generada, no persistida) ────────────────
//   1. Secretario divisional → Departamento (__sync_dir_<deptId>)
//   2. manager → subordinado por managerId (__sync_mgr_<empId>), salvo absorbidos
//      o heads de depto (cubiertos por la regla 1).
export function computeDirectorSyntheticEdges(
  departments: Department[],
  employees: Employee[],
  divisions: Division[],
  absorbedIds: Set<string>,
  deptHeadIds: Set<string>,
): Edge[] {
  const out: Edge[] = [];
  const empIds = new Set((employees ?? []).map(e => e.id));

  for (const dp of departments) {
    if (!dp.divisionId) continue;
    const div = divisions.find(d => d.id === dp.divisionId);
    const secId = div?.seniorEmployeeId;
    if (secId && empIds.has(secId)) {
      out.push({
        id: `__sync_dir_${dp.id}`,
        source: secId,
        target: dp.id,
        type: "bicolor",
        selectable: false,
        deletable: false,
        focusable: false,
      });
    }
  }

  for (const e of employees ?? []) {
    if (!e.managerId || !empIds.has(e.managerId)) continue;
    if (absorbedIds.has(e.id)) continue;
    if (deptHeadIds.has(e.id)) continue; // edge cubierto por secretario→depto
    out.push({
      id: `__sync_mgr_${e.id}`,
      source: e.managerId,
      target: e.id,
      targetHandle: "left",
      type: "bicolor",
      selectable: false,
      deletable: false,
      focusable: false,
    });
  }

  return out;
}

// ─── Build React Flow nodes (el "hub") ────────────────────────────────────────
// Combina divisiones/departamentos/empleados + los mapas calculados (tamaños,
// adyacencia, layout interno, absorción) en el array de nodos que consume ReactFlow.
// Los callbacks (resize/click) se inyectan desde el componente. Función casi-pura.
export interface BuildNodesOpts {
  divisions: Division[];
  departments: Department[];
  employees: Employee[];
  units: Unit[];
  coupledSizes: Map<string, { w: number; h: number }>;
  adjacency: Map<string, { left: boolean; right: boolean }>;
  coupledGroupPositions: Map<string, { x: number; y: number }>;
  deptAdjacency: Map<string, { left: boolean; right: boolean }>;
  deptInternalLayout: Map<string, { x: number; y: number }>;
  absorption: Absorption;
  manualSizeDivs: Set<string>;
  collapsedDivs: Set<string>;
  syncingNodeIds: Set<string>;
  showRoleBadges: boolean;
  globalConnectable: boolean;
  onDivisionResize: (id: string, w: number, h: number) => void;
  onDivisionResizeLive: (id: string, w: number, h: number) => void;
  onDepartmentResize: (id: string, w: number, h: number) => void;
  onDepartmentResizeLive: (id: string, w: number, h: number) => void;
  onUnitClick: (unitId: string) => void;
  onSubClick: (subId: string) => void;
}

export function buildNodes(opts: BuildNodesOpts): AnyNode[] {
  const {
    divisions, departments, employees, units,
    coupledSizes, adjacency, coupledGroupPositions, deptAdjacency, deptInternalLayout, absorption,
    manualSizeDivs, collapsedDivs, syncingNodeIds, showRoleBadges, globalConnectable,
    onDivisionResize, onDivisionResizeLive, onDepartmentResize, onDepartmentResizeLive, onUnitClick, onSubClick,
  } = opts;

  const result: AnyNode[] = [];
  const seen = new Set<string>();
  const push = (n: AnyNode) => {
    if (seen.has(n.id)) return; // defensive dedup — avoids React duplicate-key warnings
    seen.add(n.id);
    result.push(n);
  };

  const TRANSITION = "width 220ms cubic-bezier(0.4,0,0.2,1), height 220ms cubic-bezier(0.4,0,0.2,1), transform 220ms cubic-bezier(0.4,0,0.2,1)";

  // Divisions
  divisions.forEach(d => {
    const isManual = manualSizeDivs.has(d.id);
    const isCollapsed = collapsedDivs.has(d.id);
    const isSyncing = syncingNodeIds.has(d.id);
    const size = isManual
      ? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 }
      : (coupledSizes.get(d.id) ?? { w: d.sizeWidth ?? 720, h: d.sizeHeight ?? 500 });
    const adj = adjacency.get(d.id) ?? { left: false, right: false };
    const seniorEmp = d.seniorEmployeeId ? (employees ?? []).find(e => e.id === d.seniorEmployeeId) : null;
    const pos = coupledGroupPositions.get(d.id) ?? { x: d.positionX ?? 0, y: d.positionY ?? 0 };
    push({
      id: d.id,
      type: "division",
      position: pos,
      data: {
        name: d.name,
        color: d.color ?? "var(--c-accent-blue)",
        isDivision: true,
        subtitle: d.subtitle,
        footerText: d.footerText,
        showFooter: d.showFooter,
        adjLeft: adj.left,
        adjRight: adj.right,
        senior: seniorEmp ? { fullName: seniorEmp.fullName, jobTitle: seniorEmp.jobTitle, color: seniorEmp.color } : null,
        isConnectable: globalConnectable && d.isConnectable !== false,
        autoSize: !isManual,
        collapsed: isCollapsed,
        onResize: onDivisionResize,
        onResizeLive: onDivisionResizeLive,
      },
      style: {
        width: size.w,
        height: isCollapsed ? HEADER_H : size.h,
        zIndex: 0,
        ...(isSyncing && { transition: TRANSITION }),
      },
      draggable: true,
      selectable: true,
    });
  });

  // Pre-cálculo: altura necesaria por cada depto individualmente.
  // Cada dept crece para contener su contenido. Los depts adyacentes sincronizan
  // su height SOLO vía onDepartmentResize (BFS del grupo fusionado), no aquí.
  const DEPT_HDR = 34; const DEPT_TOP_PAD = 12; const DEPT_BOT_PAD = 16;
  const deptNeededHeight = new Map<string, number>();
  for (const dp of departments) {
    const isHeadPromoted = (dp.promoteHead ?? false) && !!dp.headEmployeeId;
    const empCount = (employees ?? []).filter(e =>
      e.departmentId === dp.id &&
      (!isHeadPromoted || e.id !== dp.headEmployeeId) &&
      !absorption.absorbedIds.has(e.id)
    ).length;
    const mode = dp.layoutMode ?? "vertical";
    const step = mode === "compact" ? (44 + 6) : (EMP_H + EMP_GAP);
    const needed = DEPT_HDR + DEPT_TOP_PAD + empCount * step + DEPT_BOT_PAD;
    deptNeededHeight.set(dp.id, Math.max(dp.sizeHeight ?? DEPT_H, needed));
  }

  // Departments — child of division if has divisionId; skip if parent division is collapsed
  departments.forEach(dp => {
    if (dp.divisionId && collapsedDivs.has(dp.divisionId)) return;
    const isHeadPromoted = (dp.promoteHead ?? false) && !!dp.headEmployeeId;
    const empCount = (employees ?? []).filter(e =>
      e.departmentId === dp.id &&
      (!isHeadPromoted || e.id !== dp.headEmployeeId) &&
      !absorption.absorbedIds.has(e.id)
    ).length;
    const headEmp = dp.headEmployeeId ? (employees ?? []).find(e => e.id === dp.headEmployeeId) : null;
    const dAdj = deptAdjacency.get(dp.id) ?? { left: false, right: false };
    const isSyncingDept = syncingNodeIds.has(dp.id);
    // Altura independiente por dept — crece para contener su contenido.
    const deptH = deptNeededHeight.get(dp.id) ?? DEPT_H;
    // Ancho mínimo = COL_X(16) + maxIndent(3 niveles×20=60) + cardWidth(200) + rightPad(14) = 290
    const neededW = 290;
    const deptW = Math.max(dp.sizeWidth ?? DEPT_W, neededW);
    const node: DepartmentNode = {
      id: dp.id,
      type: "department",
      position: { x: dp.positionX ?? 30, y: dp.positionY ?? 80 },
      data: {
        name: dp.name, color: dp.color ?? "#C8902C", isDepartment: true,
        head: headEmp ? { fullName: headEmp.fullName, jobTitle: headEmp.jobTitle, color: headEmp.color } : null,
        employeeCount: empCount,
        adjLeft: dAdj.left, adjRight: dAdj.right,
        onResize: onDepartmentResize,
        onResizeLive: onDepartmentResizeLive,
      },
      style: {
        width: deptW,
        height: deptH,
        zIndex: 1,
        ...(isSyncingDept && { transition: TRANSITION }),
      },
      draggable: true,
      selectable: true,
    };
    if (dp.divisionId) {
      node.parentId = dp.divisionId;
      node.extent = "parent";
    }
    push(node);
  });

  // Employees — child of department > division > standalone; skip if parent is collapsed
  (employees || []).forEach((emp, idx) => {
    // Skip si fue absorbido por su manager (se renderiza inline en el card del manager)
    if (absorption.absorbedIds.has(emp.id)) return;
    // Skip employees whose containing division is collapsed
    if (emp.departmentId) {
      const dept = departments.find(d => d.id === emp.departmentId);
      if (dept?.divisionId && collapsedDivs.has(dept.divisionId)) return;
    } else if (emp.divisionId && collapsedDivs.has(emp.divisionId)) {
      return;
    }

    // ── EMPLEADO (director o normal — todos viven dentro de su depto/división) ──
    const effectiveRole = getEffectiveRole(emp, employees ?? [], departments, units);
    // Posición: si manualPosition=false y hay layout calculado → usar layout jerárquico.
    const autoPos = !emp.manualPosition ? deptInternalLayout.get(emp.id) : undefined;
    const pos = autoPos
      ?? { x: emp.positionX ?? ((idx % 4) * 220 + 20), y: emp.positionY ?? (Math.floor(idx / 4) * 80 + 80) };

    // Modo compact heredado del depto contenedor (si el dept tiene layoutMode='compact')
    const empDept = emp.departmentId ? departments.find(d => d.id === emp.departmentId) : undefined;
    const isCompactMode = empDept?.layoutMode === "compact";

    const subsInCard = absorption.managerSubsMap.get(emp.id);
    const node: EmployeeNode = {
      id: emp.id,
      type: "employee",
      position: pos,
      data: {
        fullName: emp.fullName,
        jobTitle: emp.jobTitle || "Sin asignar",
        color: emp.color || "var(--c-accent-blue)",
        status: emp.status,
        imageUrl: (emp as Employee & { imageUrl?: string | null }).imageUrl ?? null,
        role: effectiveRole,
        departmentId: emp.departmentId,
        showRoleBadge: showRoleBadges,
        compact: isCompactMode,
        subordinatesInCard: subsInCard,
        unit: (() => {
          const u = emp.unitId ? units.find(x => x.id === emp.unitId) : null;
          return u ? { id: u.id, name: u.name, color: u.color, isHead: u.headEmployeeId === emp.id } : null;
        })(),
        onUnitClick,
        onSubClick,
      },
    };
    if (emp.departmentId && departments.some(d => d.id === emp.departmentId)) {
      node.parentId = emp.departmentId;
      node.extent = "parent";
    } else if (emp.divisionId && divisions.some(d => d.id === emp.divisionId)) {
      node.parentId = emp.divisionId;
      node.extent = "parent";
    }
    push(node);
  });

  return result;
}
