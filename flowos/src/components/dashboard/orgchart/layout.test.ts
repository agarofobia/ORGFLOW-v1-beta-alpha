import { describe, it, expect } from "vitest";
import type { Employee, Unit } from "@/db/schema";
import type { Division, Department } from "./types";
import {
  computeDivisionNaturalSize,
  computeCoupledSizes,
  computeAdjacency,
  computeDeptAdjacency,
  computeCoupledGroupPositions,
  computeAbsorption,
  computeDeptHeadIds,
  computeDeptInternalLayout,
  computeDirectorSyntheticEdges,
} from "./layout";
import { computeDivisionSnap, computeDepartmentSnap } from "./snap";

// ─── Factories ────────────────────────────────────────────────────────────────
const div = (p: Partial<Division> & { id: string }): Division => ({
  name: p.id, color: null, subtitle: null, footerText: null, showFooter: false,
  couplingGroup: null, seniorEmployeeId: null, isConnectable: true,
  positionX: 0, positionY: 0, sizeWidth: null, sizeHeight: null, ...p,
});
const dept = (p: Partial<Department> & { id: string }): Department => ({
  name: p.id, divisionId: null, color: null,
  positionX: 0, positionY: 0, sizeWidth: null, sizeHeight: null,
  headEmployeeId: null, ...p,
});
const emp = (p: Partial<Employee> & { id: string }): Employee =>
  ({ fullName: p.id, jobTitle: "", color: null, status: "active",
     departmentId: null, divisionId: null, unitId: null, managerId: null,
     manualPosition: false, role: null, positionX: null, positionY: null,
     ...p } as unknown as Employee);

// ─── Adjacency ──────────────────────────────────────────────────────────────
describe("computeAdjacency", () => {
  it("marca left/right según orden X dentro de un coupling group", () => {
    const divs = [
      div({ id: "a", couplingGroup: "g", positionX: 0 }),
      div({ id: "b", couplingGroup: "g", positionX: 100 }),
      div({ id: "c", couplingGroup: "g", positionX: 200 }),
    ];
    const m = computeAdjacency(divs);
    expect(m.get("a")).toEqual({ left: false, right: true });
    expect(m.get("b")).toEqual({ left: true, right: true });
    expect(m.get("c")).toEqual({ left: true, right: false });
  });
  it("una división sola no tiene adyacencia", () => {
    const m = computeAdjacency([div({ id: "solo" })]);
    expect(m.get("solo")).toEqual({ left: false, right: false });
  });
});

describe("computeDeptAdjacency", () => {
  it("fusiona dos depts del mismo division pegados en X y misma Y", () => {
    const depts = [
      dept({ id: "x", divisionId: "d", positionX: 0, positionY: 100, sizeWidth: 280 }),
      dept({ id: "y", divisionId: "d", positionX: 280, positionY: 100, sizeWidth: 280 }),
    ];
    const m = computeDeptAdjacency(depts);
    expect(m.get("x")).toEqual({ left: false, right: true });
    expect(m.get("y")).toEqual({ left: true, right: false });
  });
  it("no fusiona si están en filas distintas (Y lejos)", () => {
    const depts = [
      dept({ id: "x", divisionId: "d", positionX: 0, positionY: 100, sizeWidth: 280 }),
      dept({ id: "y", divisionId: "d", positionX: 280, positionY: 400, sizeWidth: 280 }),
    ];
    const m = computeDeptAdjacency(depts);
    expect(m.get("x")).toEqual({ left: false, right: false });
  });
});

// ─── Natural size + coupled ───────────────────────────────────────────────────
describe("computeDivisionNaturalSize", () => {
  it("división vacía → tamaño mínimo", () => {
    expect(computeDivisionNaturalSize(div({ id: "a" }), [], [])).toEqual({ w: 320, h: 140 });
  });
  it("con footer suma alto del footer", () => {
    expect(computeDivisionNaturalSize(div({ id: "a", showFooter: true }), [], [])).toEqual({ w: 320, h: 192 });
  });
  it("crece con un depto adentro", () => {
    const d = div({ id: "a" });
    const depts = [dept({ id: "dp", divisionId: "a", positionX: 16, positionY: 96, sizeWidth: 300 })];
    const size = computeDivisionNaturalSize(d, depts, []);
    expect(size.w).toBeGreaterThan(320);
  });
});

describe("computeCoupledSizes", () => {
  it("las acopladas comparten el max del grupo; las solo usan su natural", () => {
    const divs = [
      div({ id: "a", couplingGroup: "g" }),
      div({ id: "b", couplingGroup: "g", showFooter: true }),
      div({ id: "solo" }),
    ];
    const sizes = computeCoupledSizes(divs, [], []);
    expect(sizes.get("a")).toEqual(sizes.get("b")); // simétricas
    expect(sizes.get("a")!.h).toBe(192); // max(140, 192)
    expect(sizes.get("solo")).toEqual({ w: 320, h: 140 });
  });
});

describe("computeCoupledGroupPositions", () => {
  it("apila X acumulativo usando el ancho real", () => {
    const divs = [
      div({ id: "a", couplingGroup: "g", positionX: 50, positionY: 10 }),
      div({ id: "b", couplingGroup: "g", positionX: 999, positionY: 10 }),
    ];
    const sizes = new Map([["a", { w: 300, h: 200 }], ["b", { w: 300, h: 200 }]]);
    const pos = computeCoupledGroupPositions(divs, sizes, new Set());
    expect(pos.get("a")).toEqual({ x: 50, y: 10 });
    expect(pos.get("b")).toEqual({ x: 350, y: 10 }); // 50 + 300
  });
});

// ─── Absorption ───────────────────────────────────────────────────────────────
describe("computeAbsorption", () => {
  it("un manager con subordinados todos members los absorbe", () => {
    const emps = [
      emp({ id: "mgr", managerId: "boss" }),     // tiene reports → manager
      emp({ id: "s1", managerId: "mgr" }),
      emp({ id: "s2", managerId: "mgr" }),
    ];
    const { absorbedIds, managerSubsMap } = computeAbsorption(emps, [], []);
    expect(absorbedIds.has("s1")).toBe(true);
    expect(absorbedIds.has("s2")).toBe(true);
    expect(managerSubsMap.get("mgr")).toHaveLength(2);
  });
  it("no absorbe si un subordinado es a su vez manager", () => {
    const emps = [
      emp({ id: "mgr", managerId: "boss" }),
      emp({ id: "sub", managerId: "mgr" }),
      emp({ id: "subsub", managerId: "sub" }), // sub tiene report → manager
    ];
    const { absorbedIds } = computeAbsorption(emps, [], []);
    expect(absorbedIds.has("sub")).toBe(false);
  });
});

// ─── Dept internal layout ─────────────────────────────────────────────────────
describe("computeDeptInternalLayout", () => {
  it("coloca el head primero y aplica indent por nivel", () => {
    const depts = [dept({ id: "d", headEmployeeId: "h" })];
    const emps = [
      emp({ id: "h", departmentId: "d" }),
      emp({ id: "sub", departmentId: "d", managerId: "h" }),
    ];
    const pos = computeDeptInternalLayout(depts, emps, new Set());
    expect(pos.get("h")).toEqual({ x: 16, y: 46 });        // COL_X, TOP_Y
    expect(pos.get("sub")).toEqual({ x: 36, y: 46 + 82 }); // indent 20, step 82
  });
  it("modo manual no posiciona nada", () => {
    const depts = [dept({ id: "d", layoutMode: "manual" })];
    const emps = [emp({ id: "e", departmentId: "d" })];
    expect(computeDeptInternalLayout(depts, emps, new Set()).size).toBe(0);
  });
});

// ─── Synthetic edges ──────────────────────────────────────────────────────────
describe("computeDirectorSyntheticEdges", () => {
  it("genera secretario→depto y manager→subordinado, salvo absorbidos/heads", () => {
    const divisions = [div({ id: "div", seniorEmployeeId: "sec" })];
    const departments = [dept({ id: "dp", divisionId: "div", headEmployeeId: "head" })];
    const employees = [
      emp({ id: "sec" }),
      emp({ id: "head", departmentId: "dp", managerId: "sec" }), // head → no edge mgr (cubierto)
      emp({ id: "worker", managerId: "sec" }),
    ];
    const deptHeadIds = computeDeptHeadIds(departments);
    const edges = computeDirectorSyntheticEdges(departments, employees, divisions, new Set(), deptHeadIds);
    const ids = edges.map(e => e.id);
    expect(ids).toContain("__sync_dir_dp");   // secretario → depto
    expect(ids).toContain("__sync_mgr_worker"); // manager → worker
    expect(ids).not.toContain("__sync_mgr_head"); // head excluido
  });
});

// ─── Snap ─────────────────────────────────────────────────────────────────────
describe("computeDivisionSnap", () => {
  const divs = [
    div({ id: "drag" }),
    div({ id: "anchor", positionX: 1000, positionY: 0 }),
  ];
  const sizes = new Map([["drag", { w: 300, h: 200 }], ["anchor", { w: 300, h: 200 }]]);
  const groupPos = new Map<string, { x: number; y: number }>();
  it("pega a la derecha del anchor cuando cae cerca de su borde derecho", () => {
    const snap = computeDivisionSnap("drag", 1305, 10, divs, sizes, groupPos);
    expect(snap).toMatchObject({ x: 1300, y: 0, anchorId: "anchor" });
  });
  it("devuelve null si está lejos", () => {
    expect(computeDivisionSnap("drag", 200, 600, divs, sizes, groupPos)).toBeNull();
  });
});

describe("computeDepartmentSnap", () => {
  const depts = [
    dept({ id: "drag", divisionId: "d", sizeWidth: 280 }),
    dept({ id: "other", divisionId: "d", positionX: 500, positionY: 100, sizeWidth: 280 }),
  ];
  it("pega a la izquierda del other cuando el borde derecho cae cerca", () => {
    const snap = computeDepartmentSnap("drag", 210, 100, depts); // right edge 490 ~ other.left 500
    expect(snap).toEqual({ x: 220, y: 100 }); // 500 - 280
  });
  it("null si Y lejos", () => {
    expect(computeDepartmentSnap("drag", 210, 900, depts)).toBeNull();
  });
});
