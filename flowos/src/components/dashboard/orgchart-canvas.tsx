"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Connection,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlowProvider,
  Panel,
  useReactFlow,
  useNodesInitialized,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layers, FolderPlus, Users, Briefcase, Sparkles } from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { Employee, type Unit } from "@/db/schema";
import { useOrganization } from "@clerk/nextjs";

// Tipos, nodos, modales y ColorPicker viven en src/components/dashboard/orgchart/
import type {
  Division, Department,
  EmployeeNode, DepartmentNode, AnyNode,
} from "./orgchart/types";
import { nodeTypes, edgeTypes } from "./orgchart/nodes";
import {
  NewPositionModal, type NewPositionParent,
  DivisionEditModal, DepartmentEditModal,
  QuickPromptModal, RenameModal,
  AdoptDepartmentModal, MoveEmployeeModal,
} from "./orgchart/modals";
import {
  AddPositionPanel, AddGroupPanel, SearchPanel,
  ContextMenu, type CtxTarget,
} from "./orgchart/panels";
import { NodeInfoPanel, UnitEditPanel, type EmployeeWithSection } from "./orgchart/NodeInfoPanel";
import { getEffectiveRole } from "./orgchart/roles";
import BulkActionToolbar from "./orgchart/BulkActionToolbar";
import {
  computeCoupledSizes, computeAdjacency, computeDeptAdjacency,
  computeCoupledGroupPositions, computeAbsorption, computeDeptHeadIds,
  computeDeptInternalLayout, computeDirectorSyntheticEdges,
} from "./orgchart/layout";
import { computeDivisionSnap as snapDivision, computeDepartmentSnap as snapDepartment } from "./orgchart/snap";
import { LAYOUT } from "./orgchart/constants";
import { useOrgChartToggles } from "./orgchart/use-orgchart-toggles";
import { useUndoRedo, type MoveOp } from "./orgchart/use-undo-redo";
import { computeAutoLayout } from "./orgchart/auto-layout";
import { exportOrgChartPng } from "./orgchart/export-png";
import { useOrgChartData } from "./orgchart/use-orgchart-data";
import { OrgChartToolbar } from "./orgchart/Toolbar";


// ─── Debounce helper ─────────────────────────────────────────────────────────

function useDebounce<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ─── Main Canvas ─────────────────────────────────────────────────────────────

function OrgChartFlow() {
  const { employees, addEmployee, updateEmployee, deleteEmployee, error, refetch: refetchEmployees } = useEmployees();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";
  const { screenToFlowPosition, getViewport, setViewport, fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  // Estado de datos + carga + refs + persistencia de edges → orgchart/use-orgchart-data.ts
  const {
    divisions, setDivisions, departments, setDepartments,
    units, setUnits, edges, setEdges,
    divisionsRef, departmentsRef, unitsRef, saveEdges,
  } = useOrgChartData();
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState<"division" | "department" | null>(null);
  const [pendingCreatePos, setPendingCreatePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedEmpNode, setSelectedEmpNode] = useState<EmployeeNode | null>(null);
  const [contextMenu, setContextMenu] = useState<CtxTarget | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "division" | "department"; id: string; name: string } | null>(null);
  const [newPosition, setNewPosition] = useState<NewPositionParent>(null);
  const [openNewPosition, setOpenNewPosition] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState<{ title: string; placeholder?: string; onConfirm: (v: string) => Promise<void> | void } | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [movingEmployeeId, setMovingEmployeeId] = useState<string | null>(null);
  const [adoptingDivisionId, setAdoptingDivisionId] = useState<string | null>(null);
  const [autoLayoutPending, setAutoLayoutPending] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  // Divisions in this set use stored sizeWidth/Height (manual) instead of auto-computed natural size
  const [manualSizeDivs, setManualSizeDivs] = useState<Set<string>>(new Set());
  const [collapsedDivs, setCollapsedDivs] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const {
    globalConnectable, setGlobalConnectable,
    linkedResize, setLinkedResize,
    showRoleBadges, setShowRoleBadges,
    locked, setLocked,
  } = useOrgChartToggles();

  // ── Undo / Redo (solo posiciones de nodes) ────────────────────────────────
  // applyMove vive acá porque necesita los setters de estado; los stacks + atajos de
  // teclado están en useUndoRedo (orgchart/use-undo-redo.ts).
  const applyMove = useCallback((op: MoveOp, useFromPos: boolean) => {
    const x = useFromPos ? op.fromX : op.toX;
    const y = useFromPos ? op.fromY : op.toY;
    if (op.entityType === "employee") {
      fetch(`/api/employees/${op.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionX: x, positionY: y, manualPosition: true }),
      }).catch(() => {});
      updateEmployeeRef.current(op.id, { positionX: x, positionY: y, manualPosition: true }).catch(() => {});
    } else if (op.entityType === "division") {
      fetch(`/api/divisions/${op.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionX: x, positionY: y }),
      }).catch(() => {});
      setDivisions(prev => prev.map(d => d.id === op.id ? { ...d, positionX: x, positionY: y } : d));
    } else if (op.entityType === "department") {
      fetch(`/api/departments/${op.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionX: x, positionY: y }),
      }).catch(() => {});
      setDepartments(prev => prev.map(d => d.id === op.id ? { ...d, positionX: x, positionY: y } : d));
    }
  }, []);
  const { recordMove, doUndo, doRedo, canUndo, canRedo } = useUndoRedo(applyMove);
  // Nodos que están recibiendo un cambio programático de tamaño/posición y necesitan animar.
  // Se vacía solo ~350ms después de marcar para no animar drags posteriores.
  const [syncingNodeIds, setSyncingNodeIds] = useState<Set<string>>(new Set());
  const syncingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSyncing = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setSyncingNodeIds(prev => {
      const s = new Set(prev);
      ids.forEach(id => s.add(id));
      return s;
    });
    if (syncingTimerRef.current) clearTimeout(syncingTimerRef.current);
    syncingTimerRef.current = setTimeout(() => {
      setSyncingNodeIds(new Set());
    }, 360);
  }, []);

  // Compute the flow-coords for the visible viewport center
  const getViewportCenter = useCallback((): { x: number; y: number } => {
    const vp = getViewport();
    const w = window.innerWidth, h = window.innerHeight;
    const cx = (w / 2 - vp.x) / vp.zoom;
    const cy = (h / 2 - vp.y) / vp.zoom;
    return { x: cx, y: cy };
  }, [getViewport]);

  // ── Refs estables para callbacks ──────────────────────────────────────────
  const employeesRef = useRef(employees);
  const updateEmployeeRef = useRef(updateEmployee);
  const linkedResizeRef = useRef<boolean>(true);
  // deptAdjacency snapshot for use inside resize callbacks (updated by useEffect)
  const deptAdjacencyRef = useRef<Map<string, { left: boolean; right: boolean }>>(new Map());
  // Synchronous re-entry guard for auto-layout — `autoLayoutPending` (React state)
  // updates async, so two fast clicks both pass the check. A ref is synchronous.
  const autoLayoutRunningRef = useRef(false);
  // Right-click drag tracking
  const rightDragRef = useRef<{ x: number; y: number } | null>(null);
  const suppressCtxMenuRef = useRef(false);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => { updateEmployeeRef.current = updateEmployee; }, [updateEmployee]);

  // Prevents ReactFlow from firing edge-remove events when we programmatically replace
  // the nodes array (e.g. on employee add). Without this, edges between divisions get
  // wiped from state and saved to DB as removed.
  const suppressEdgeRemove = useRef(false);

  useEffect(() => { linkedResizeRef.current = linkedResize; }, [linkedResize]);

  // Fix del bug visual al cargar: edges apuntan a handles sin dimensiones medidas.
  // useNodesInitialized() devuelve true solo cuando ReactFlow midió TODOS los nodos
  // en el DOM — esa es la señal real, no un timeout arbitrario.
  const didInitialPaint = useRef(false);
  useEffect(() => {
    if (!nodesInitialized) return;
    if (didInitialPaint.current) return;
    didInitialPaint.current = true;
    requestAnimationFrame(() => {
      try { fitView({ duration: 0, padding: 0.15 }); } catch { /* ignore */ }
    });
  }, [nodesInitialized, fitView]);

  const handleDivisionResize = useCallback((id: string, w: number, h: number) => {
    const newW = Math.round(w);
    const newH = Math.round(h);
    // Si linkedResize y la división pertenece a un coupling group → propagar a hermanos
    const divs = divisionsRef.current;
    const div = divs.find(d => d.id === id);
    const targets = (linkedResizeRef.current && div?.couplingGroup)
      ? divs.filter(d => d.couplingGroup === div.couplingGroup).map(d => d.id)
      : [id];
    setManualSizeDivs(prev => {
      const s = new Set(prev);
      targets.forEach(t => s.add(t));
      return s;
    });
    targets.forEach(t => {
      fetch(`/api/divisions/${t}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizeWidth: newW, sizeHeight: newH }),
      }).catch(() => {});
    });
    const targetSet = new Set(targets);
    setDivisions(prev => prev.map(d => targetSet.has(d.id) ? { ...d, sizeWidth: newW, sizeHeight: newH } : d));
    // Animar hermanos sincronizados (no el que el usuario está resizeando — ése sigue el cursor)
    markSyncing(targets.filter(t => t !== id));
  }, [markSyncing]);

  // Live cascade durante el drag — solo afecta estado local (nodes), sin API.
  // Permite ver cómo los hermanos se mueven/escalan mientras todavía estás arrastrando.
  const handleDivisionResizeLive = useCallback((id: string, w: number, h: number) => {
    if (!linkedResizeRef.current) return;
    const divs = divisionsRef.current;
    const div = divs.find(d => d.id === id);
    if (!div?.couplingGroup) return;
    const group = divs.filter(d => d.couplingGroup === div.couplingGroup);
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    const baseX = sorted[0].positionX ?? 0;
    const baseY = sorted[0].positionY ?? 0;
    // Layout cumulativo en vivo: todos los del grupo comparten W y H = (w, h) del que se resizea
    let cumX = baseX;
    const updates = new Map<string, { x: number; y: number; w: number; h: number }>();
    sorted.forEach(d => {
      updates.set(d.id, { x: cumX, y: baseY, w, h });
      cumX += w;
    });
    setNodes(prev => prev.map(n => {
      const u = updates.get(n.id);
      if (!u || n.type !== "division") return n;
      return { ...n, position: { x: u.x, y: u.y }, style: { ...n.style, width: u.w, height: u.h } };
    }));
  }, []);

  const handleDepartmentResizeLive = useCallback((id: string, w: number, h: number) => {
    // Guard 1: standalone dept (no adjacent neighbors) → nothing to propagate
    const adj = deptAdjacencyRef.current.get(id);
    if (!adj?.left && !adj?.right) return;
    // Guard 2: linked resize toggle
    if (!linkedResizeRef.current) return;

    const depts = departmentsRef.current;
    const dept = depts.find(d => d.id === id);
    if (!dept?.divisionId) return;

    // BFS through adjacency map — only depts the snap mechanism fused together
    const visited = new Set<string>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      const cd = depts.find(d => d.id === cur);
      if (!cd) continue;
      const cX = cd.positionX ?? 0;
      const cY = cd.positionY ?? 0;
      const cW = cd.sizeWidth ?? 280;
      for (const other of depts) {
        if (other.id === cur || visited.has(other.id)) continue;
        if (other.divisionId !== cd.divisionId) continue;
        // Only consider depts that deptAdjacency already considers adjacent to something
        const otherAdj = deptAdjacencyRef.current.get(other.id);
        if (!otherAdj?.left && !otherAdj?.right) continue;
        const oX = other.positionX ?? 0;
        const oY = other.positionY ?? 0;
        const oW = other.sizeWidth ?? 280;
        if (Math.abs(oY - cY) > 30) continue;
        if (Math.abs((oX + oW) - cX) < 4 || Math.abs(oX - (cX + cW)) < 4) {
          visited.add(other.id);
          queue.push(other.id);
        }
      }
    }
    if (visited.size <= 1) return;

    const oldW = dept.sizeWidth ?? 280;
    const deltaW = w - oldW;
    const groupSorted = Array.from(visited)
      .map(gid => depts.find(d => d.id === gid)!)
      .sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
    const resizedIdx = groupSorted.findIndex(d => d.id === id);

    // Build sibling updates:
    //   • Height always syncs across the whole group.
    //   • Right siblings also sync width and cascade their X position
    //     using the resized dept's stored X as the anchor (right-border drag keeps
    //     the left edge fixed, so positionX is still the pre-resize value here).
    //   • Left siblings: only height — making them wider would push them outside the div.
    const resizedX = dept.positionX ?? 0;
    const liveUpdates = new Map<string, { x: number; w: number; h: number }>();
    groupSorted.forEach((d, i) => {
      if (d.id === id) return;
      if (i > resizedIdx) {
        // Right sibling — same width, X anchored to resized dept's left edge
        liveUpdates.set(d.id, {
          x: resizedX + (i - resizedIdx) * w,
          w,
          h,
        });
      } else {
        // Left sibling — only height syncs, position and width unchanged
        liveUpdates.set(d.id, {
          x: d.positionX ?? 0,
          w: d.sizeWidth ?? 280,
          h,
        });
      }
    });
    if (liveUpdates.size === 0) return;

    // Apply sibling updates — the resized node is already handled by React Flow
    setNodes(prev => prev.map(n => {
      const u = liveUpdates.get(n.id);
      if (!u || n.type !== "department") return n;
      return {
        ...n,
        position: { x: u.x, y: n.position.y },
        style: { ...n.style, width: u.w, height: u.h },
      };
    }));
  }, []);

  const handleDepartmentResize = useCallback((id: string, w: number, h: number) => {
    const newW = Math.round(w);
    const newH = Math.round(h);
    const depts = departmentsRef.current;
    const dept = depts.find(d => d.id === id);
    const oldW = dept?.sizeWidth ?? 280;
    const deltaW = newW - oldW;

    type DeptUpdate = { id: string; sizeWidth?: number; sizeHeight?: number; positionX?: number };
    const updates: DeptUpdate[] = [{ id, sizeWidth: newW, sizeHeight: newH }];

    // Only propagate to siblings when:
    // 1. linkedResize toggle is ON
    // 2. This dept actually has adjacent neighbors (per deptAdjacency ref)
    const adj = deptAdjacencyRef.current.get(id);
    const hasNeighbors = adj?.left || adj?.right;

    if (linkedResizeRef.current && hasNeighbors && dept?.divisionId) {
      // BFS por adyacencia para encontrar el grupo fusionado completo.
      // Sólo incluye depts que el sistema de snap ha fusionado (deptAdjacency ≠ vacío).
      const visited = new Set<string>([id]);
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        const curDept = depts.find(d => d.id === cur);
        if (!curDept) continue;
        const cX = curDept.positionX ?? 0;
        const cY = curDept.positionY ?? 0;
        const cW = curDept.sizeWidth ?? 280;
        for (const other of depts) {
          if (other.id === cur || visited.has(other.id)) continue;
          if (other.divisionId !== curDept.divisionId) continue;
          // Skip depts with no adjacency at all (standalone depts in the same division)
          const otherAdj = deptAdjacencyRef.current.get(other.id);
          if (!otherAdj?.left && !otherAdj?.right) continue;
          const oX = other.positionX ?? 0;
          const oY = other.positionY ?? 0;
          const oW = other.sizeWidth ?? 280;
          if (Math.abs(oY - cY) > 30) continue;
          if (Math.abs((oX + oW) - cX) < 4 || Math.abs(oX - (cX + cW)) < 4) {
            visited.add(other.id);
            queue.push(other.id);
          }
        }
      }

      // Ordenar por X — los que están a la derecha del resizeado deben shiftearse
      // por deltaW para mantener la fusión visual cuando el W cambia.
      const groupSorted = Array.from(visited)
        .map(gid => depts.find(d => d.id === gid)!)
        .sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
      const resizedIdx = groupSorted.findIndex(d => d.id === id);

      const resizedX = dept?.positionX ?? 0;
      groupSorted.forEach((d, i) => {
        if (d.id === id) return;
        if (i > resizedIdx) {
          // Right sibling: sync width + cascade X from resized dept's anchor
          updates.push({
            id: d.id,
            sizeWidth: newW,
            sizeHeight: newH,
            positionX: resizedX + (i - resizedIdx) * newW,
          });
        } else {
          // Left sibling: only sync height
          updates.push({ id: d.id, sizeHeight: newH });
        }
      });
    }

    // Persist + actualizar estado local
    updates.forEach(u => {
      const body: Record<string, number> = {};
      if (u.sizeWidth !== undefined) body.sizeWidth = u.sizeWidth;
      if (u.sizeHeight !== undefined) body.sizeHeight = u.sizeHeight;
      if (u.positionX !== undefined) body.positionX = u.positionX;
      fetch(`/api/departments/${u.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    });
    const updateMap = new Map(updates.map(u => [u.id, u]));
    setDepartments(prev => prev.map(d => {
      const u = updateMap.get(d.id);
      if (!u) return d;
      return {
        ...d,
        ...(u.sizeWidth !== undefined && { sizeWidth: u.sizeWidth }),
        ...(u.sizeHeight !== undefined && { sizeHeight: u.sizeHeight }),
        ...(u.positionX !== undefined && { positionX: u.positionX }),
      };
    }));
    // Animar todos los hermanos sincronizados (no el resizeado — sigue el cursor)
    markSyncing(updates.map(u => u.id).filter(uid => uid !== id));
  }, [markSyncing]);

  // ── Auto-size logic ──────────────────────────────────────────────────────
  // Constantes canónicas del layout (orgchart/constants.ts). La geometría vive en
  // orgchart/layout.ts; acá sólo se memoizan los resultados.
  const { HEADER_H, PADDING, DEPT_W, DEPT_H, DEPT_GAP, EMP_H, EMP_GAP } = LAYOUT;

  // Tamaños: acopladas comparten max del grupo; solo usan su natural. Lógica en layout.ts.
  const coupledSizes = useMemo(
    () => computeCoupledSizes(divisions, departments, employees ?? []),
    [divisions, departments, employees],
  );

  // Adjacency: which divisions have left/right neighbors (for fused visual).
  // Derived from couplingGroup membership + positionX order — NOT from pixel tolerance.
  // This way it stays correct even when division sizes change dynamically.
  const adjacency = useMemo(() => computeAdjacency(divisions), [divisions]);

  // Set de IDs de todos los heads de departamento — usado para generar edges correctas.
  const deptHeadIds = useMemo(() => computeDeptHeadIds(departments), [departments]);

  // Absorción de subordinados: un manager (role=manager) cuyos subordinados
  // sean TODOS miembros (role=member) los "absorbe" → se renderizan como lista
  // inline dentro del card del manager, no como cards separados.
  // No aplica si algún subordinado es manager/director (ahí se necesita la jerarquía visible).
  const absorption = useMemo(
    () => computeAbsorption(employees ?? [], departments, units),
    [employees, departments, units],
  );

  // Edges sintéticas — generadas automáticamente, no se persisten ni son editables:
  //   1. Secretario divisional → Departamento (__sync_dir_<deptId>)
  //      El secretario es el seniorEmployee de la división contenedora del depto.
  //   2. manager → subordinado para cada empleado con managerId (__sync_mgr_<empId>)
  //      Se omite el edge hacia los directores (heads de depto) ya que su conexión
  //      está cubierta por la regla 1 (secretario → depto que los contiene).
  // El usuario ve la jerarquía completa sin tener que dibujar líneas a mano.
  const directorSyntheticEdges = useMemo<Edge[]>(
    () => computeDirectorSyntheticEdges(departments, employees ?? [], divisions, absorption.absorbedIds, deptHeadIds),
    [departments, employees, absorption, divisions, deptHeadIds],
  );

  // Motor de layout interno por departamento — respeta el layoutMode del depto:
  //   - "vertical": stack vertical con indent por nivel (modo default, clásico)
  //   - "compact": stack vertical SIN indent, gap menor, cards más chicas (mostradas vía empCompact)
  //   - "manual": no auto-posiciona nada, respeta lo que el usuario dragueó
  // El head/director siempre se incluye dentro del depto (arriba del todo), ya NO se promueve afuera.
  const deptInternalLayout = useMemo(
    () => computeDeptInternalLayout(departments, employees ?? [], absorption.absorbedIds),
    [departments, employees, absorption],
  );

  // Adyacencia entre departamentos: dos depts del MISMO division con misma Y y
  // X alineados (right de uno = left del otro, dentro de tolerancia) → se ven fusionados.
  // No requiere columna couplingGroup en DB — se deriva puramente de posiciones.
  const deptAdjacency = useMemo(() => computeDeptAdjacency(departments), [departments]);
  // Keep ref in sync so resize callbacks can read it without adding it as a dep
  useEffect(() => { deptAdjacencyRef.current = deptAdjacency; }, [deptAdjacency]);

  // Dynamic positions for coupled groups: when a division grows/shrinks, right-side
  // siblings shift automatically so the group stays flush — no DB write needed.
  // Solo divisions just use their stored positionX/Y unchanged.
  const coupledGroupPositions = useMemo(
    () => computeCoupledGroupPositions(divisions, coupledSizes, manualSizeDivs),
    [divisions, coupledSizes, manualSizeDivs],
  );

  const handleUnitClick = useCallback((unitId: string) => {
    const unit = unitsRef.current.find(u => u.id === unitId);
    if (unit) setSelectedUnit(unit);
  }, []);

  // Click en subordinado absorbido → abre NodeInfoPanel construyendo nodo sintético.
  // NodeInfoPanel hace su propio lookup por id en `employees`, así que solo necesita id + datos base.
  const handleSubClick = useCallback((subId: string) => {
    const emp = (employeesRef.current ?? []).find(e => e.id === subId);
    if (!emp) return;
    const syntheticNode: EmployeeNode = {
      id: emp.id,
      type: "employee",
      position: { x: 0, y: 0 },
      data: {
        fullName: emp.fullName,
        jobTitle: emp.jobTitle || "Sin asignar",
        color: emp.color || "var(--c-accent-blue)",
        status: emp.status,
      },
    };
    setSelectedUnit(null);
    setSelectedEmpNode(syntheticNode);
  }, []);

  // ── Build the React Flow nodes from data ──────────────────────────────────
  const computedNodes: AnyNode[] = useMemo(() => {
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
          onResize: handleDivisionResize,
          onResizeLive: handleDivisionResizeLive,
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
    // su height SOLO vía handleDepartmentResize (BFS del grupo fusionado), no aquí.
    // Eliminar el "siblingsMaxH" evita que resizear un dept afecte a otros no pegados.
    const DEPT_HDR = 34; const DEPT_TOP_PAD = 12; const DEPT_BOT_PAD = 16;
    const deptNeededHeight = new Map<string, number>();
    for (const dp of departments) {
      // El director/head se excluye del cálculo de altura mínima para no forzar
      // un mínimo mayor que el sizeHeight guardado (lo que bloquearía el resize).
      // El director se renderiza dentro del depto independientemente.
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
      const dpLayoutMode = dp.layoutMode ?? "vertical";
      // Altura independiente por dept — crece para contener su contenido.
      // La sincronización entre depts adyacentes ocurre en handleDepartmentResize (BFS).
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
          onResize: handleDepartmentResize,
          onResizeLive: handleDepartmentResizeLive,
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
      // Si manualPosition=true o no hay layout → usar positionX/Y del DB (drag manual).
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
          onUnitClick: handleUnitClick,
          onSubClick: handleSubClick,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, departments, employees, units, coupledSizes, adjacency, coupledGroupPositions, deptAdjacency, deptInternalLayout, deptHeadIds, absorption, showRoleBadges, globalConnectable, manualSizeDivs, collapsedDivs, syncingNodeIds, handleDivisionResize, handleDepartmentResize, handleDivisionResizeLive, handleDepartmentResizeLive, handleUnitClick, handleSubClick]);

  // Local nodes state — ReactFlow mutates this freely during drag (smooth UX).
  // We sync from `computedNodes` whenever the underlying data changes.
  const [nodes, setNodes] = useState<AnyNode[]>(computedNodes);

  // Bulk operations — selectedEmployeeIds para el toolbar.
  // Se actualiza con onSelectionChange de ReactFlow (shift+click o drag-select).
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const handleSelectionChange = useCallback(({ nodes: selNodes }: { nodes: AnyNode[]; edges: Edge[] }) => {
    const empIds = selNodes.filter((n) => n.type === "employee").map((n) => n.id);
    setSelectedEmployeeIds(empIds);
  }, []);
  const clearSelection = useCallback(() => {
    setNodes((curr) => curr.map((n) => ({ ...n, selected: false })));
    setSelectedEmployeeIds([]);
  }, []);
  const onBulkApplied = useCallback(() => {
    refetchEmployees();
    clearSelection();
  }, [clearSelection, refetchEmployees]);

  useEffect(() => {
    suppressEdgeRemove.current = true;
    setNodes(computedNodes);
    requestAnimationFrame(() => { suppressEdgeRemove.current = false; });
  }, [computedNodes]);

  // saveEdges viene de useOrgChartData. Debounce corto (200ms): si el usuario cierra el
  // browser justo después de conectar dos nodos, perder 200ms es aceptable.
  const debouncedSaveEdges = useDebounce(saveEdges, 200);

  // ── Snap helper: when dropping a division near another, align edges and couple ──
  // Returns { x, y, couplingGroup } if a snap should happen, else null
  const computeDivisionSnap = useCallback(
    (draggedId: string, dragX: number, dragY: number) =>
      snapDivision(draggedId, dragX, dragY, divisions, coupledSizes, coupledGroupPositions),
    [divisions, coupledSizes, coupledGroupPositions],
  );

  // Snap entre departamentos del MISMO division — los pega bordes-con-bordes igual que divisiones.
  // No usa couplingGroup (no existe esa columna en depts); solo alinea X y Y.
  const computeDepartmentSnap = useCallback(
    (draggedId: string, dragX: number, dragY: number) => snapDepartment(draggedId, dragX, dragY, departments),
    [departments],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // PROTECCIÓN ANTI-DESAPARICIÓN: ignorar changes "remove" que vengan de ReactFlow.
    // La única forma legítima de borrar un puesto/depto/división es via API DELETE,
    // que actualiza el array (employees/departments/divisions) y triggera recompute.
    // Sin este filtro, ciertos drag/bug/race conditions emiten "remove" → el node
    // desaparece del state local pero queda en DB, y el useEffect de sync no lo
    // restaura porque `computedNodes` no cambió (misma referencia).
    // Sí permitimos remove de edges sintéticas via su propio path (onEdgeContextMenu).
    const safe = changes.filter(c => c.type !== "remove");
    if (safe.length === 0) return;
    // Clamp employee/department Y inside divisions so they don't invade the header zone.
    // The header occupies the top HEADER_H px of any division.
    const DEPT_HEADER_H = 34;
    const clamped = safe.map(change => {
      if (change.type === "position" && change.position) {
        const node = nodes.find(n => n.id === change.id);
        if (!node) return change;
        if ((node.type === "employee" || node.type === "department") && node.parentId) {
          const parent = nodes.find(n => n.id === node.parentId);
          if (parent) {
            let minY = 0;
            // Empleado/Depto dentro de división: no invadir el header de la división
            if (parent.type === "division") minY = HEADER_H;
            // Empleado dentro de departamento: no invadir el header del departamento
            else if (parent.type === "department" && node.type === "employee") minY = DEPT_HEADER_H;
            if (minY && change.position.y < minY) {
              return { ...change, position: { ...change.position, y: minY } };
            }
          }
        }
      }
      return change;
    });
    // Apply (possibly clamped) changes locally for smooth dragging.
    // Dedup defensivo: applyNodeChanges + parent-child nodes en concurrent mode
    // puede producir IDs duplicados transientemente → React avisa de key prop.
    setNodes(prev => {
      const next = applyNodeChanges(clamped, prev) as AnyNode[];
      const seen = new Set<string>();
      return next.filter(n => !seen.has(n.id) && (seen.add(n.id), true));
    });

    // For drag-end (position with !dragging), persist to API and snap divisions
    clamped.forEach(change => {
      if (change.type === "position" && change.dragging === false && change.position) {
        const node = nodes.find(n => n.id === change.id);
        if (!node) return;
        if (node.type === "employee") {
          // Drop-to-reassign: si el empleado se soltó encima de otro empleado del
          // MISMO departamento, en vez de quedar en esa posición manual, se reasigna
          // su managerId al empleado de debajo y el layout jerárquico lo reposiciona.
          // Drop en zona libre → posición manual (comportamiento original).
          const EMP_W_HIT = 200; // ancho EmployeeNodeView
          const EMP_H_HIT = 70;
          const nx = change.position.x;
          const ny = change.position.y;
          const dropTarget = nodes.find(other =>
            other.id !== change.id &&
            other.type === "employee" &&
            other.parentId === node.parentId &&
            nx >= (other.position.x - 4) &&
            nx <= (other.position.x + EMP_W_HIT - 4) &&
            ny >= (other.position.y - 4) &&
            ny <= (other.position.y + EMP_H_HIT - 4)
          );
          if (dropTarget) {
            // Drop sobre otro empleado → reasigna jefe directo, vuelve a auto-layout.
            updateEmployeeRef.current(change.id, {
              managerId: dropTarget.id,
              manualPosition: false,
            }).catch(() => {});
          } else {
            // Drop en vacío → marca manualPosition=true para respetar la posición.
            const fromX = node.position.x;
            const fromY = node.position.y;
            updateEmployeeRef.current(change.id, {
              positionX: change.position.x,
              positionY: change.position.y,
              manualPosition: true,
            }).catch(() => {});
            // Solo registramos undo si efectivamente se movió
            if (fromX !== change.position.x || fromY !== change.position.y) {
              recordMove({
                entityType: "employee", id: change.id,
                fromX, fromY,
                toX: change.position.x, toY: change.position.y,
              });
            }
          }
        } else if (node.type === "division") {
          // Snap-or-decouple: dropping near another division couples them; dropping far away decouples
          const snap = computeDivisionSnap(change.id, change.position.x, change.position.y);
          const nextX = snap?.x ?? change.position.x;
          const nextY = snap?.y ?? change.position.y;
          const nextGroup: string | null = snap ? snap.couplingGroup : null;

          if (snap) {
            // Apply snap visually immediately
            setNodes(prev => prev.map(n => n.id === change.id ? { ...n, position: { x: nextX, y: nextY } } : n));
            // Symmetry fix: the anchor division also needs its couplingGroup set if it didn't have one.
            // Without this, only the dragged division gets the group key — adjacency breaks for the anchor.
            const anchor = divisions.find(d => d.id === snap.anchorId);
            if (anchor && !anchor.couplingGroup) {
              fetch(`/api/divisions/${anchor.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ couplingGroup: snap.couplingGroup }),
              }).catch(() => {});
              setDivisions(prev => prev.map(d => d.id === anchor.id ? { ...d, couplingGroup: snap.couplingGroup } : d));
            }
          }
          fetch(`/api/divisions/${change.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: nextX, positionY: nextY, couplingGroup: nextGroup }),
          }).catch(() => {});
          setDivisions(prev => prev.map(d => d.id === change.id ? { ...d, positionX: nextX, positionY: nextY, couplingGroup: nextGroup } : d));
          // Registrar move para undo
          const divFrom = divisions.find(d => d.id === change.id);
          if (divFrom && (divFrom.positionX !== nextX || divFrom.positionY !== nextY)) {
            recordMove({
              entityType: "division", id: change.id,
              fromX: divFrom.positionX ?? 0, fromY: divFrom.positionY ?? 0,
              toX: nextX, toY: nextY,
            });
          }
        } else if (node.type === "department") {
          // ── Drag-to-reparent: detectar si el dept cayó dentro de otra división ───
          // Calcular posición mundo (node.position es local si tiene parentId)
          let worldX = change.position.x;
          let worldY = change.position.y;
          if (node.parentId) {
            const parentNode = nodes.find(n => n.id === node.parentId);
            if (parentNode) { worldX += parentNode.position.x; worldY += parentNode.position.y; }
          }
          // Centro estimado del dept
          const DEPT_W_EST = 260;
          const DEPT_H_EST = 80;
          const centerX = worldX + DEPT_W_EST / 2;
          const centerY = worldY + DEPT_H_EST / 2;
          // Buscar si hay una división que contenga ese centro
          const targetDivNode = nodes.find(n => {
            if (n.type !== "division") return false;
            const dw = typeof n.style?.width === "number" ? n.style.width : 400;
            const dh = typeof n.style?.height === "number" ? n.style.height : 300;
            return centerX >= n.position.x && centerX <= n.position.x + dw &&
                   centerY >= n.position.y && centerY <= n.position.y + dh;
          });
          const currentDept = departments.find(d => d.id === change.id);
          const currentDivId = currentDept?.divisionId ?? null;
          const newDivId = targetDivNode?.id ?? null;
          if (newDivId !== currentDivId) {
            // Reparentar: convertir coords mundo a local de la nueva división (si hay)
            let localX = worldX;
            let localY = worldY;
            if (targetDivNode) {
              localX = worldX - targetDivNode.position.x;
              localY = Math.max(HEADER_H + 10, worldY - targetDivNode.position.y);
            }
            fetch(`/api/departments/${change.id}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ divisionId: newDivId, positionX: localX, positionY: localY }),
            }).catch(() => {});
            setDepartments(prev => prev.map(d =>
              d.id === change.id ? { ...d, divisionId: newDivId, positionX: localX, positionY: localY } : d
            ));
            return; // no hacer snap ni undo de posición normal
          }
          // ── Posición normal (sin reparent) ────────────────────────────────────
          const dSnap = computeDepartmentSnap(change.id, change.position.x, change.position.y);
          const nx = dSnap?.x ?? change.position.x;
          const ny = dSnap?.y ?? change.position.y;
          if (dSnap) {
            setNodes(prev => prev.map(n => n.id === change.id ? { ...n, position: { x: nx, y: ny } } : n));
          }
          fetch(`/api/departments/${change.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: nx, positionY: ny }),
          }).catch(() => {});
          setDepartments(prev => prev.map(d => d.id === change.id ? { ...d, positionX: nx, positionY: ny } : d));
          // Registrar move para undo
          const dpFrom = departments.find(d => d.id === change.id);
          if (dpFrom && (dpFrom.positionX !== nx || dpFrom.positionY !== ny)) {
            recordMove({
              entityType: "department", id: change.id,
              fromX: dpFrom.positionX ?? 0, fromY: dpFrom.positionY ?? 0,
              toX: nx, toY: ny,
            });
          }
        }
      }
    });
  }, [nodes, divisions, departments, computeDivisionSnap, computeDepartmentSnap, recordMove]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => {
      // Filtrar cambios que toquen edges sintéticas (director→depto generadas auto).
      // No deben persistirse ni borrarse desde el UI.
      const userChanges = changes.filter(c =>
        !("id" in c) || typeof c.id !== "string" || !c.id.startsWith("__sync_")
      );
      const toApply = suppressEdgeRemove.current
        ? userChanges.filter(c => c.type !== "remove")
        : userChanges;
      const next = applyEdgeChanges(toApply, eds);
      if (!suppressEdgeRemove.current) debouncedSaveEdges(next);
      return next;
    });
  }, [debouncedSaveEdges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      const next = addEdge({ ...connection, type: "bicolor" }, eds);
      saveEdges(next);
      return next;
    });
  }, [saveEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: AnyNode) => {
    setContextMenu(null);
    // Single-click solo abre el panel del empleado. Divisiones/Departamentos
    // se editan vía doble-click o context menu para no interferir con el resize.
    if (node.type === "employee") {
      setSelectedEmpNode(node);
      setEditingDivision(null);
      setEditingDepartment(null);
    } else {
      setSelectedEmpNode(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEmpNode(null);
    setContextMenu(null);
  }, []);

  // Double-click: división → zoom to fit; departamento → abre modal de edición
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: AnyNode) => {
    if (node.type === "division") {
      fitView({ nodes: [{ id: node.id }], duration: 600, padding: 0.15 });
    } else if (node.type === "department") {
      const dept = departments.find(d => d.id === node.id);
      if (dept) setEditingDepartment(dept);
    }
  }, [fitView, departments]);

  // Navigate (search result click) — expand if collapsed, then zoom
  const handleNavigate = useCallback((nodeId: string) => {
    setCollapsedDivs(prev => {
      if (!prev.has(nodeId)) return prev;
      const s = new Set(prev);
      s.delete(nodeId);
      return s;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3 });
    }));
  }, [fitView]);

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    if (suppressCtxMenuRef.current) { suppressCtxMenuRef.current = false; return; }
    setContextMenu({ kind: "canvas", x: e.clientX, y: e.clientY });
    setSelectedEmpNode(null);
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: AnyNode) => {
    e.preventDefault();
    if (suppressCtxMenuRef.current) { suppressCtxMenuRef.current = false; return; }
    if (node.type === "employee") setContextMenu({ kind: "employee", id: node.id, x: e.clientX, y: e.clientY });
    else if (node.type === "division") {
      const div = divisions.find(d => d.id === node.id);
      setContextMenu({ kind: "division", id: node.id, x: e.clientX, y: e.clientY, isConnectable: div?.isConnectable !== false, autoSize: !manualSizeDivs.has(node.id), collapsed: collapsedDivs.has(node.id) });
    }
    else if (node.type === "department") {
      const dept = departments.find(d => d.id === node.id);
      setContextMenu({ kind: "department", id: node.id, x: e.clientX, y: e.clientY, divisionId: dept?.divisionId ?? null });
    }
  }, [divisions, manualSizeDivs, collapsedDivs]);

  // Click derecho en una conexión → menú con opción Eliminar.
  // Las edges sintéticas (__sync_*) muestran info pero no permiten eliminar.
  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    if (suppressCtxMenuRef.current) { suppressCtxMenuRef.current = false; return; }
    const isSynthetic = typeof edge.id === "string" && edge.id.startsWith("__sync_");
    setContextMenu({ kind: "edge", id: edge.id, x: e.clientX, y: e.clientY, isSynthetic });
  }, []);

  // ── Create employee ───────────────────────────────────────────────────────
  const handleAddEmployee = async (jobTitle: string, fullName: string, color: string, parent?: { kind: "division" | "department"; id: string }, extras?: { description?: string; salary?: string; email?: string; phone?: string; startDate?: string; managerId?: string; role?: string; }) => {
    const allEmps = employeesRef.current ?? [];
    const totalCount = allEmps.length;
    // Si va dentro de un dpto y se asigna managerId → manualPosition=false (auto-layout DIR→ENC→team).
    // Si va suelto o se rompe la cadena de jerarquía → manualPosition=true con posición calculada.
    const goesIntoDept = parent?.kind === "department";
    const useAutoLayout = goesIntoDept;
    let parentCount = 0;
    if (parent?.kind === "division") {
      parentCount = allEmps.filter(e => e.divisionId === parent.id && !e.departmentId).length;
    } else if (parent?.kind === "department") {
      parentCount = allEmps.filter(e => e.departmentId === parent.id).length;
    }
    const baseCount = parent ? parentCount : totalCount;
    const deptHeaderH = 34;
    const positionX = PADDING;
    const positionY = parent
      ? (parent.kind === "division" ? HEADER_H : deptHeaderH) + PADDING + baseCount * (EMP_H + EMP_GAP)
      : Math.floor(totalCount / 4) * 120 + 40;
    const data: Partial<Employee> & { fullName: string; jobTitle: string; color: string; positionX: number; positionY: number } = {
      fullName, jobTitle, color, positionX, positionY,
      manualPosition: !useAutoLayout,
      ...(extras?.description && { description: extras.description }),
      ...(extras?.salary && { salary: extras.salary }),
      ...(extras?.email && { email: extras.email }),
      ...(extras?.phone && { phone: extras.phone }),
      ...(extras?.startDate && { startDate: new Date(extras.startDate) }),
      ...(extras?.managerId && { managerId: extras.managerId }),
      ...(extras?.role && { role: extras.role }),
    };
    if (parent?.kind === "division") (data as Partial<Employee>).divisionId = parent.id;
    if (parent?.kind === "department") {
      (data as Partial<Employee>).departmentId = parent.id;
      const dept = departments.find(d => d.id === parent.id);
      if (dept?.divisionId) (data as Partial<Employee>).divisionId = dept.divisionId;
    }
    const newEmp = await addEmployee(data as Parameters<typeof addEmployee>[0]);
    // Auto-head: lo hace el endpoint POST /employees server-side (atomic).
    // Acá sólo sincronizamos el state local si correspondió.
    if (parent?.kind === "department" && newEmp?.id && !extras?.managerId) {
      const dept = departments.find(d => d.id === parent.id);
      if (dept && !dept.headEmployeeId) {
        setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, headEmployeeId: newEmp.id } : d));
      }
    }
    return newEmp;
  };

  // Handler used by NewPositionModal (full form)
  const handleNewPositionCreate = async (data: {
    jobTitle: string; fullName: string; color: string;
    description?: string; salary?: string; email?: string; phone?: string; startDate?: string;
    assignedEmployeeId?: string;
    reportsToId?: string;
    role?: string;
  }) => {
    let parent: { kind: "division" | "department"; id: string } | undefined;
    if (newPosition?.kind === "division") parent = { kind: "division", id: newPosition.id };
    if (newPosition?.kind === "department") parent = { kind: "department", id: newPosition.id };
    if (newPosition?.kind === "employee") {
      const boss = employees.find(e => e.id === newPosition.id);
      if (boss?.departmentId) parent = { kind: "department", id: boss.departmentId };
      else if (boss?.divisionId) parent = { kind: "division", id: boss.divisionId };
    }
    // managerId: prioridad explícita del usuario → headEmployeeId del dept → parent employee
    let managerId: string | undefined = data.reportsToId;
    if (!managerId && newPosition?.kind === "department") {
      const deptForHead = departments.find(d => d.id === newPosition.id);
      if (deptForHead?.headEmployeeId) managerId = deptForHead.headEmployeeId;
    }
    if (!managerId && newPosition?.kind === "employee") managerId = newPosition.id;
    await handleAddEmployee(
      data.jobTitle,
      data.fullName,
      data.color,
      parent,
      {
        description: data.description, salary: data.salary,
        email: data.email, phone: data.phone, startDate: data.startDate,
        managerId,
        role: data.role,
      }
    );
  };

  // ── Create division ───────────────────────────────────────────────────────
  const handleAddDivision = async (data: { name: string; color: string }, position?: { x: number; y: number }) => {
    // Default position: viewport center if not specified, else stored pendingCreatePos, else 0/0
    const pos = position ?? pendingCreatePos ?? getViewportCenter();
    // Centrado usando el tamaño natural mínimo (que es lo que realmente se renderiza
    // si la división está vacía); así el click cae cerca del centro visual de la división.
    const naturalW = 320;
    const naturalH = 180;
    const x = pos.x - naturalW / 2;
    const y = pos.y - naturalH / 2;
    const res = await fetch("/api/divisions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name, color: data.color,
        positionX: x, positionY: y,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setDivisions(prev => [...prev, created]);
    }
    setPendingCreatePos(null);
  };

  // ── Create department ─────────────────────────────────────────────────────
  const handleAddDepartment = async (data: { name: string; color: string; divisionId?: string }, position?: { x: number; y: number }) => {
    const inDivision = data.divisionId;
    const sameDivCount = departments.filter(d => d.divisionId === inDivision).length;
    const standaloneCount = departments.filter(d => !d.divisionId).length;
    const res = await fetch("/api/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name, color: data.color,
        divisionId: inDivision,
        positionX: position?.x ?? (inDivision ? PADDING + sameDivCount * (DEPT_W + DEPT_GAP) : standaloneCount * 400 + 50),
        positionY: position?.y ?? (inDivision ? HEADER_H + PADDING : 600),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setDepartments(prev => [...prev, created]);
      // Pan to the new department so it's visible immediately
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fitView({ nodes: [{ id: created.id }], duration: 500, padding: 0.4 });
      }));
    }
  };

  // ── Delete handlers ───────────────────────────────────────────────────────
  const deleteDivision = async (id: string) => {
    if (!confirm("¿Eliminar la división? Sus departamentos quedarán independientes.")) return;
    await fetch(`/api/divisions/${id}`, { method: "DELETE" });
    setDivisions(prev => prev.filter(d => d.id !== id));
    setDepartments(prev => prev.map(d => d.divisionId === id ? { ...d, divisionId: null } : d));
  };
  const deleteDepartment = async (id: string) => {
    if (!confirm("¿Eliminar el departamento? Los empleados quedarán sin departamento.")) return;
    await fetch(`/api/departments/${id}`, { method: "DELETE" });
    setDepartments(prev => prev.filter(d => d.id !== id));
  };

  // ── Context menu actions ──────────────────────────────────────────────────
  const handleCtxAction = async (action: string) => {
    if (!contextMenu) return;
    const t = contextMenu;

    // Acciones sobre una conexión (edge)
    if (t.kind === "edge") {
      if (action === "delete-edge" && !t.isSynthetic) {
        setEdges(prev => {
          const next = prev.filter(e => e.id !== t.id);
          saveEdges(next);
          return next;
        });
      }
      return;
    }

    if (t.kind === "canvas") {
      // Convert screen coords (where the user right-clicked) to flow coords
      const flowPos = screenToFlowPosition({ x: t.x, y: t.y });
      setPendingCreatePos(flowPos);
      if (action === "new-division") setShowAddGroup("division");
      if (action === "new-department") setShowAddGroup("department");
      if (action === "new-position") setShowAddEmp(true);
    }

    if (t.kind === "division") {
      const div = divisions.find(d => d.id === t.id);
      if (action === "edit" && div) { setEditingDivision(div); setContextMenu(null); }
      if (action === "new-department-in") {
        setQuickPrompt({
          title: `Nuevo departamento en "${div?.name ?? ""}"`,
          placeholder: "Nombre del departamento",
          onConfirm: async (name) => {
            await handleAddDepartment({ name, color: div?.color ?? "#C8902C", divisionId: t.id });
          },
        });
      }
      if (action === "new-position-in" && div) {
        setNewPosition({ kind: "division", id: t.id, name: div.name, color: div.color ?? "var(--c-accent-blue)" });
        setOpenNewPosition(true);
      }
      if (action === "toggle-collapse") {
        setCollapsedDivs(prev => {
          const s = new Set(prev);
          if (s.has(t.id)) s.delete(t.id); else s.add(t.id);
          return s;
        });
      }
      if (action === "toggle-autosize") {
        setManualSizeDivs(prev => {
          const s = new Set(prev);
          if (s.has(t.id)) s.delete(t.id); else s.add(t.id);
          return s;
        });
      }
      if (action === "toggle-connectable" && div) {
        const next = div.isConnectable === false ? true : false;
        fetch(`/api/divisions/${t.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isConnectable: next }),
        }).catch(() => {});
        setDivisions(prev => prev.map(d => d.id === t.id ? { ...d, isConnectable: next } : d));
      }
      if (action === "adopt-department") setAdoptingDivisionId(t.id);
      if (action === "move-up" || action === "move-down") {
        // Swap Y position with nearest division above (move-up) or below (move-down)
        const sorted = [...divisions].sort((a, b) => (a.positionY ?? 0) - (b.positionY ?? 0));
        const idx = sorted.findIndex(d => d.id === t.id);
        if (idx !== -1) {
          const swapIdx = action === "move-up" ? idx - 1 : idx + 1;
          if (swapIdx >= 0 && swapIdx < sorted.length) {
            const cur = sorted[idx];
            const neighbor = sorted[swapIdx];
            const newCurY = neighbor.positionY ?? 0;
            const newNbrY = cur.positionY ?? 0;
            await Promise.all([
              fetch(`/api/divisions/${cur.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionY: newCurY }) }),
              fetch(`/api/divisions/${neighbor.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionY: newNbrY }) }),
            ]);
            setDivisions(prev => prev.map(d => {
              if (d.id === cur.id) return { ...d, positionY: newCurY };
              if (d.id === neighbor.id) return { ...d, positionY: newNbrY };
              return d;
            }));
          }
        }
      }
      if (action === "rename" && div) setRenaming({ kind: "division", id: t.id, name: div.name });
      if (action === "delete") await deleteDivision(t.id);
    }

    if (t.kind === "department") {
      const dept = departments.find(d => d.id === t.id);
      if (action === "edit" && dept) { setEditingDepartment(dept); setContextMenu(null); }
      if (action === "new-position-in" && dept) {
        setNewPosition({ kind: "department", id: t.id, name: dept.name, color: dept.color ?? "#C8902C" });
        setOpenNewPosition(true);
      }
      if (action === "reorganize-positions") {
        // Limpiar manualPosition=false en todos los empleados del dpto → activa layout jerárquico
        const empsInDept = (employees ?? []).filter(e => e.departmentId === t.id);
        await Promise.all(empsInDept.map(e =>
          updateEmployeeRef.current(e.id, { manualPosition: false }).catch(() => {})
        ));
      }
      if (action === "unlink-division" && dept) {
        // Sacar de división: set divisionId = null, mover a posición mundo
        const parentNode = nodes.find(n => n.id === dept.divisionId);
        const worldX = (parentNode?.position.x ?? 0) + (dept.positionX ?? 0);
        const worldY = (parentNode?.position.y ?? 0) + (dept.positionY ?? 0);
        fetch(`/api/departments/${t.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ divisionId: null, positionX: worldX, positionY: worldY }),
        }).catch(() => {});
        setDepartments(prev => prev.map(d => d.id === t.id ? { ...d, divisionId: null, positionX: worldX, positionY: worldY } : d));
      }
      if ((action === "move-up" || action === "move-down") && dept) {
        // Swap X position con el depto vecino más cercano (mismo divisionId o ambos sin div)
        const siblings = departments.filter(d => d.divisionId === dept.divisionId);
        const sorted = [...siblings].sort((a, b) => (a.positionX ?? 0) - (b.positionX ?? 0));
        const idx = sorted.findIndex(d => d.id === t.id);
        if (idx !== -1) {
          const swapIdx = action === "move-up" ? idx - 1 : idx + 1;
          if (swapIdx >= 0 && swapIdx < sorted.length) {
            const neighbor = sorted[swapIdx];
            const newCurX = neighbor.positionX ?? 0;
            const newNbrX = dept.positionX ?? 0;
            await Promise.all([
              fetch(`/api/departments/${dept.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionX: newCurX }) }),
              fetch(`/api/departments/${neighbor.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionX: newNbrX }) }),
            ]);
            setDepartments(prev => prev.map(d => {
              if (d.id === dept.id) return { ...d, positionX: newCurX };
              if (d.id === neighbor.id) return { ...d, positionX: newNbrX };
              return d;
            }));
          }
        }
      }
      if (action === "rename" && dept) setRenaming({ kind: "department", id: t.id, name: dept.name });
      if (action === "delete") await deleteDepartment(t.id);
    }

    if (t.kind === "employee") {
      const emp = employees.find(e => e.id === t.id);
      if (action === "edit") {
        const node = nodes.find(n => n.id === t.id) as EmployeeNode | undefined;
        if (node) setSelectedEmpNode(node);
      }
      if (action === "new-subordinate" && emp) {
        // Inherit color from boss
        setNewPosition({
          kind: "employee", id: emp.id,
          fullName: emp.fullName, jobTitle: emp.jobTitle ?? "",
          color: emp.color ?? "var(--c-accent-blue)",
        });
        setOpenNewPosition(true);
      }
      if (action === "move-to-department") {
        setMovingEmployeeId(t.id);
      }
      if (action === "vacate") {
        // Vaciar = mantener el nodo, sólo limpiar la persona asignada.
        // El backend pone fullName="[Puesto vacante]" y borra email/phone/salary.
        const res = await fetch(`/api/employees/${t.id}/vacate`, { method: "PUT" });
        if (res.ok) {
          const updated = await res.json();
          // Optimistic update local en SWR cache via updateEmployeeRef no aplica acá
          // porque vacate es endpoint propio; usamos el dato del response.
          await updateEmployeeRef.current(t.id, {
            fullName: updated.fullName,
            email: null, phone: null, salary: null,
          }).catch(() => {});
        }
      }
      if (action === "delete") {
        setQuickPrompt({
          title: "Eliminar puesto definitivamente",
          placeholder: 'Escribí "ELIMINAR" para confirmar',
          onConfirm: async (v) => {
            if (v.toUpperCase() === "ELIMINAR") {
              // Backend cascade: limpia headEmployeeId, seniorEmployeeId, managerId de subordinados.
              await deleteEmployee(t.id);
              if (selectedEmpNode?.id === t.id) setSelectedEmpNode(null);
            }
          },
        });
      }
    }
  };

  const handleSaveEmployee = async (id: string, updates: Partial<EmployeeWithSection>) => {
    await updateEmployeeRef.current(id, updates);
    setSelectedEmpNode(prev => prev?.id === id ? { ...prev, data: { ...prev.data, fullName: updates.fullName ?? prev.data.fullName, jobTitle: updates.jobTitle ?? prev.data.jobTitle } } : prev);
  };

  const handleSaveUnit = async (id: string, updates: { name?: string; headEmployeeId?: string | null; color?: string | null }) => {
    await fetch(`/api/units/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    setSelectedUnit(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  };

  const handleDeleteUnit = async (id: string) => {
    await fetch(`/api/units/${id}`, { method: "DELETE" });
    setUnits(prev => prev.filter(u => u.id !== id));
    setSelectedUnit(null);
  };

  const handleSaveDivision = async (updates: Partial<Division>) => {
    if (!editingDivision) return;
    await fetch(`/api/divisions/${editingDivision.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setDivisions(prev => prev.map(d => d.id === editingDivision.id ? { ...d, ...updates } : d));
  };

  const handleSaveDepartment = async (updates: Partial<Department>) => {
    if (!editingDepartment) return;
    await fetch(`/api/departments/${editingDepartment.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setDepartments(prev => prev.map(d => d.id === editingDepartment.id ? { ...d, ...updates } : d));
  };

  const handleAutoLayout = useCallback(async () => {
    // Re-entry guard (synchronous): block concurrent runs from double-clicks.
    if (autoLayoutRunningRef.current) return;
    autoLayoutRunningRef.current = true;
    setAutoLayoutPending(true);
    try {
      // Cálculo dagre + posiciones de depts/secretarios → orgchart/auto-layout.ts
      const { newDivPositions, newDeptPositions, newDeptSizes, newSecPositions } =
        computeAutoLayout(divisions, departments, edges, coupledSizes, manualSizeDivs);

      // Save to API in chunks to avoid saturating the Supabase pool (max 5 conns).
      // Con 27 depts + 10 divs + secretarios eran ~45 requests concurrentes →
      // saturaban el pooler y devolvían 500s. Lotes de 5 lo mantienen estable.
      const saveTasks: Array<() => Promise<unknown>> = [
        ...Array.from(newDivPositions.entries()).map(([id, pos]) => () =>
          fetch(`/api/divisions/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: pos.x, positionY: pos.y }),
          })
        ),
        ...Array.from(newDeptPositions.entries()).map(([id, pos]) => () => {
          const body: Record<string, number> = { positionX: pos.x, positionY: pos.y };
          const w = newDeptSizes.get(id);
          if (w !== undefined) body.sizeWidth = w;
          return fetch(`/api/departments/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }),
        ...Array.from(newSecPositions.entries()).map(([id, pos]) => () =>
          fetch(`/api/employees/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionX: pos.x, positionY: pos.y, manualPosition: true }),
          })
        ),
      ];
      const CHUNK = 5;
      for (let i = 0; i < saveTasks.length; i += CHUNK) {
        await Promise.all(saveTasks.slice(i, i + CHUNK).map(fn => fn()));
      }

      // Update local state — computedNodes effect will re-sync ReactFlow
      setDivisions(prev => prev.map(d => {
        const pos = newDivPositions.get(d.id);
        return pos ? { ...d, positionX: pos.x, positionY: pos.y } : d;
      }));
      setDepartments(prev => prev.map(dp => {
        const pos = newDeptPositions.get(dp.id);
        const w = newDeptSizes.get(dp.id);
        if (!pos && w === undefined) return dp;
        return {
          ...dp,
          ...(pos && { positionX: pos.x, positionY: pos.y }),
          ...(w !== undefined && { sizeWidth: w }),
        };
      }));
      // Secretary positions update — trigger SWR revalidation
      if (newSecPositions.size > 0) refetchEmployees();
    } finally {
      setAutoLayoutPending(false);
      autoLayoutRunningRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, departments, edges, coupledSizes, manualSizeDivs, refetchEmployees]);

  const handleExportPng = useCallback(async () => {
    setExportingPng(true);
    try {
      await exportOrgChartPng(nodes);
    } catch (err) {
      console.error("Export PNG error:", err);
    } finally {
      setExportingPng(false);
    }
  }, [nodes]);

  const handleRename = async (newName: string) => {
    if (!renaming) return;
    if (renaming.kind === "division") {
      await fetch(`/api/divisions/${renaming.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      setDivisions(prev => prev.map(d => d.id === renaming.id ? { ...d, name: newName } : d));
    } else {
      await fetch(`/api/departments/${renaming.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      setDepartments(prev => prev.map(d => d.id === renaming.id ? { ...d, name: newName } : d));
    }
  };

  // Adoptar un departamento en la división `adoptingDivisionId` (modal AdoptDepartmentModal).
  const handleAdoptDepartment = (deptId: string) => {
    if (!adoptingDivisionId) return;
    const localX = 20;
    const localY = HEADER_H + 20;
    fetch(`/api/departments/${deptId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId: adoptingDivisionId, positionX: localX, positionY: localY }),
    }).catch(() => {});
    setDepartments(prev => prev.map(d =>
      d.id === deptId ? { ...d, divisionId: adoptingDivisionId, positionX: localX, positionY: localY } : d
    ));
    setAdoptingDivisionId(null);
  };

  // Mover el empleado `movingEmployeeId` a un departamento (modal MoveEmployeeModal).
  const handleMoveEmployee = async (dept: Department) => {
    if (!movingEmployeeId) return;
    await updateEmployeeRef.current(movingEmployeeId, {
      departmentId: dept.id,
      divisionId: dept.divisionId ?? null,
      managerId: null,
      manualPosition: false,
      positionX: 30,
      positionY: 80,
    });
    setMovingEmployeeId(null);
  };

  // Dedup defensivo justo antes del render. Si por algún motivo (HMR, race en
  // setState, applyNodeChanges añadiendo duplicados, etc.) llegan dos nodes/edges
  // con el mismo id, React falla con "Each child in a list should have a unique
  // 'key' prop". Esto lo previene siempre.
  const dedupedNodes = useMemo(() => {
    const seen = new Set<string>();
    return nodes.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [nodes]);
  const dedupedEdges = useMemo(() => {
    // Solo emitimos una edge si AMBOS source y target están presentes como nodes
    // en el state local. Evita el bug visual del primer render donde las edges
    // sintéticas se renderizaban contra nodes con posiciones intermedias / faltantes.
    const nodeIds = new Set(nodes.map(n => n.id));
    const seen = new Set<string>();
    const all = [...edges, ...directorSyntheticEdges];
    return all.filter(e => {
      if (seen.has(e.id)) return false;
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
      seen.add(e.id);
      return true;
    });
  }, [edges, directorSyntheticEdges, nodes]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center" style={{ background: "var(--c-bg-base)" }}>
        <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg p-5 text-center"
          style={{ background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.3)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--c-accent-red)" }}>Error al cargar empleados</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-muted)" }}>{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Estilos globales para nodos del orgchart — animaciones y hover */}
      <style>{`
        .react-flow__node-division:hover,
        .react-flow__node-department:hover {
          filter: brightness(1.05);
        }
        .react-flow__node-employee:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        /* Animación de fade-in removida: el transform: scale(0.96) inicial
           descolocaba los handles (que están en top:-3) durante los ~200ms
           del fade. Los nodos ahora aparecen sin animación. */
        /* Handles: visibles siempre, color sólido (estilo original) */
        .orgchart-handle {
          opacity: 1;
          transition: transform 120ms ease;
        }
        .orgchart-handle:hover {
          transform: scale(1.3);
        }

        /* LOCK MODE: nodes dejan pasar clicks al canvas → pan funciona donde sea.
           Selector con especificidad ALTA para sobrescribir CSS interno de ReactFlow. */
        div.react-flow.flowos-locked .react-flow__node,
        div.react-flow.flowos-locked .react-flow__node *,
        div.react-flow.flowos-locked .react-flow__nodes,
        div.react-flow.flowos-locked .react-flow__node-resizer {
          pointer-events: none !important;
        }
        div.react-flow.flowos-locked .react-flow__pane {
          cursor: grab !important;
        }
        div.react-flow.flowos-locked .react-flow__pane:active {
          cursor: grabbing !important;
        }
      `}</style>
      <div
        style={{ width: "100%", height: "100%", position: "relative" }}
        onMouseDown={e => {
          if (e.button !== 2) return;
          rightDragRef.current = { x: e.clientX, y: e.clientY };
          suppressCtxMenuRef.current = false;
        }}
        onMouseMove={e => {
          if (!rightDragRef.current || !(e.buttons & 2)) return;
          const dx = e.clientX - rightDragRef.current.x;
          const dy = e.clientY - rightDragRef.current.y;
          if (Math.hypot(dx, dy) < 3) return;
          suppressCtxMenuRef.current = true;
          rightDragRef.current.x = e.clientX;
          rightDragRef.current.y = e.clientY;
          const vp = getViewport();
          setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
        }}
        onMouseUp={e => {
          if (e.button !== 2) return;
          rightDragRef.current = null;
          // suppressCtxMenuRef stays true if drag occurred; onPaneContextMenu resets it
        }}
        onContextMenu={e => {
          if (suppressCtxMenuRef.current) e.preventDefault();
        }}
      >
      <ReactFlow
        nodes={dedupedNodes}
        edges={dedupedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Control"
        selectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "bicolor" }}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        elementsSelectable={!locked}
        panOnDrag={[0, 1, 2]}
        panActivationKeyCode="Space"
        zoomOnPinch={true}
        panOnScroll={false}
        minZoom={0.2}
        maxZoom={2}
        onSelectionChange={handleSelectionChange}
        className={locked ? "flowos-locked" : ""}
        style={{ background: "var(--c-bg-base)" }}
      >
        <Background color="var(--c-border)" gap={32} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as { color?: string };
            return data?.color || "var(--c-accent-blue)";
          }}
          maskColor="rgba(8,11,18,0.7)"
        />

        {/* Toolbar principal — flotante centrada arriba (estilo Excalidraw/tldraw) */}
        {isAdmin && (
          <Panel position="top-center" className="mt-4">
            <div className="flex flex-col items-center gap-2">
              <OrgChartToolbar
                searchOpen={searchOpen}
                onToggleSearch={() => setSearchOpen(prev => !prev)}
                autoLayoutPending={autoLayoutPending}
                onAutoLayout={() => { if (!autoLayoutPending) handleAutoLayout(); }}
                exportingPng={exportingPng}
                onExport={handleExportPng}
                onNewDivision={() => { setPendingCreatePos(null); setShowAddGroup("division"); setShowAddEmp(false); }}
                onNewDepartment={() => { setPendingCreatePos(null); setShowAddGroup("department"); setShowAddEmp(false); }}
                onNewPosition={() => { setPendingCreatePos(null); setShowAddEmp(true); setShowAddGroup(null); }}
                globalConnectable={globalConnectable}
                setGlobalConnectable={setGlobalConnectable}
                linkedResize={linkedResize}
                setLinkedResize={setLinkedResize}
                showRoleBadges={showRoleBadges}
                setShowRoleBadges={setShowRoleBadges}
                locked={locked}
                setLocked={setLocked}
                canUndo={canUndo}
                onUndo={doUndo}
                canRedo={canRedo}
                onRedo={doRedo}
              />
              {searchOpen && (
                <SearchPanel
                  divisions={divisions}
                  departments={departments}
                  employees={employees}
                  onNavigate={handleNavigate}
                  onClose={() => setSearchOpen(false)}
                />
              )}
              {showAddEmp && (
                <AddPositionPanel
                  onAdd={async (jt, fn, c) => { await handleAddEmployee(jt, fn, c); }}
                  onClose={() => setShowAddEmp(false)}
                />
              )}
              {showAddGroup === "division" && (
                <AddGroupPanel type="division" divisions={divisions}
                  onAdd={d => handleAddDivision(d)} onClose={() => setShowAddGroup(null)} />
              )}
              {showAddGroup === "department" && (
                <AddGroupPanel type="department" divisions={divisions}
                  onAdd={d => handleAddDepartment(d)} onClose={() => setShowAddGroup(null)} />
              )}
            </div>
          </Panel>
        )}


        {/* Employee panel — key={node.id} forces remount on selection change so all fields reset cleanly */}
        {selectedEmpNode && !selectedUnit && (
          <Panel position="top-left" className="m-4">
            <NodeInfoPanel
              key={selectedEmpNode.id}
              node={selectedEmpNode}
              employees={employees}
              divisions={divisions}
              departments={departments}
              units={units}
              isAdmin={isAdmin}
              onSave={handleSaveEmployee}
              onClose={() => setSelectedEmpNode(null)}
            />
          </Panel>
        )}

        {/* Unit edit panel — abre cuando se hace click en el chip de una unidad */}
        {selectedUnit && (
          <Panel position="top-left" className="m-4">
            <UnitEditPanel
              key={selectedUnit.id}
              unit={selectedUnit}
              employees={employees ?? []}
              isAdmin={isAdmin}
              onSave={handleSaveUnit}
              onDelete={handleDeleteUnit}
              onClose={() => setSelectedUnit(null)}
            />
          </Panel>
        )}

        {/* Hint badge */}
        {!selectedEmpNode && !showAddEmp && !showAddGroup && (
          <Panel position="top-left" className="m-4">
            <div className="flex items-center gap-2 px-3 py-2 text-xs"
              style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 6, color: "var(--c-text-muted)" }}>
              <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--c-accent-blue)" }} />
              Click derecho para crear · Drag para mover · Delete para conexiones
            </div>
          </Panel>
        )}

        {/* Stats badge */}
        <Panel position="bottom-left" className="m-4 mb-16">
          <div className="flex gap-3 px-3 py-2 text-[10px] font-mono"
            style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)", borderRadius: 6, color: "var(--c-text-muted)" }}>
            <span className="flex items-center gap-1"><Layers size={11} /> {divisions.length}</span>
            <span className="flex items-center gap-1"><FolderPlus size={11} /> {departments.length}</span>
            <span className="flex items-center gap-1"><Users size={11} /> {employees.length}</span>
            <span className="flex items-center gap-1"><Briefcase size={11} /> {employees.filter(e => e.fullName !== "[Puesto vacante]").length}</span>
          </div>
        </Panel>
      </ReactFlow>
      </div>

      {/* Context menu (rendered outside ReactFlow) */}
      {contextMenu && (
        <ContextMenu target={contextMenu} onAction={handleCtxAction} onClose={() => setContextMenu(null)} />
      )}

      {/* Rename modal */}
      {renaming && (
        <RenameModal
          initialValue={renaming.name}
          title={renaming.kind === "division" ? "Renombrar división" : "Renombrar departamento"}
          onSave={handleRename}
          onClose={() => setRenaming(null)}
        />
      )}

      {/* New position modal (full form) */}
      {openNewPosition && (
        <NewPositionModal
          parent={newPosition}
          employees={employees}
          departments={departments}
          defaultColor={newPosition?.color ?? "var(--c-accent-blue)"}
          onCreate={handleNewPositionCreate}
          onClose={() => { setOpenNewPosition(false); setNewPosition(null); }}
        />
      )}

      {/* Quick prompt modal (lightweight) */}
      {quickPrompt && (
        <QuickPromptModal
          title={quickPrompt.title}
          placeholder={quickPrompt.placeholder}
          onConfirm={quickPrompt.onConfirm}
          onClose={() => setQuickPrompt(null)}
        />
      )}

      {/* Division edit modal */}
      {editingDivision && (
        <DivisionEditModal
          key={editingDivision.id}
          division={editingDivision}
          employees={employees}
          onSave={handleSaveDivision}
          onDelete={async () => { await deleteDivision(editingDivision.id); setEditingDivision(null); }}
          onClose={() => setEditingDivision(null)}
        />
      )}

      {/* Department edit modal */}
      {editingDepartment && (
        <DepartmentEditModal
          key={editingDepartment.id}
          department={editingDepartment}
          employees={employees}
          onSave={handleSaveDepartment}
          onClose={() => setEditingDepartment(null)}
        />
      )}

      {/* Adopt department into division picker */}
      {adoptingDivisionId && (
        <AdoptDepartmentModal
          targetDivisionId={adoptingDivisionId}
          divisions={divisions}
          departments={departments}
          onAdopt={handleAdoptDepartment}
          onClose={() => setAdoptingDivisionId(null)}
        />
      )}

      {/* Move employee to department picker */}
      {movingEmployeeId && (
        <MoveEmployeeModal
          currentDepartmentId={(employees ?? []).find(e => e.id === movingEmployeeId)?.departmentId ?? null}
          departments={departments}
          divisions={divisions}
          onMove={handleMoveEmployee}
          onClose={() => setMovingEmployeeId(null)}
        />
      )}

      {/* Bulk actions toolbar — solo aparece con 2+ employee nodes seleccionados */}
      <BulkActionToolbar
        selectedIds={selectedEmployeeIds}
        selectedEmployees={employees.filter((e) => selectedEmployeeIds.includes(e.id)).map((e) => ({
          id: e.id, fullName: e.fullName,
          departmentId: e.departmentId, divisionId: e.divisionId,
        }))}
        allEmployees={employees.map((e) => ({
          id: e.id, fullName: e.fullName,
          departmentId: e.departmentId, divisionId: e.divisionId,
        }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
        units={units.map((u) => ({ id: u.id, name: u.name, departmentId: u.departmentId }))}
        onApplied={onBulkApplied}
        onClear={clearSelection}
      />
    </>
  );
}

export function OrgChartCanvas() {
  return (
    <ReactFlowProvider>
      <OrgChartFlow />
    </ReactFlowProvider>
  );
}
