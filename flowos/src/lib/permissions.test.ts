import { describe, it, expect } from "vitest";
import {
  hasPermission,
  mergePermissions,
  PRESETS,
  type PermissionsMap,
} from "./permissions";

describe("hasPermission", () => {
  const map: PermissionsMap = {
    employees: { view: true, edit: true },
    projects: { view: true },
  };

  it("returns true when the action is explicitly granted", () => {
    expect(hasPermission(map, "employees", "view")).toBe(true);
    expect(hasPermission(map, "employees", "edit")).toBe(true);
  });

  it("returns false when the action is not granted", () => {
    expect(hasPermission(map, "employees", "delete")).toBe(false);
    expect(hasPermission(map, "projects", "edit")).toBe(false);
  });

  it("returns false for a module that is not present", () => {
    expect(hasPermission(map, "settings", "view")).toBe(false);
    expect(hasPermission({}, "employees", "view")).toBe(false);
  });

  it("treats a missing action as denied (deny-by-default)", () => {
    expect(hasPermission({ ai: {} }, "ai", "create")).toBe(false);
  });
});

describe("mergePermissions", () => {
  it("ORs grants across maps — any map granting wins", () => {
    const a: PermissionsMap = { employees: { view: true } };
    const b: PermissionsMap = { employees: { edit: true }, projects: { view: true } };
    const merged = mergePermissions(a, b);
    expect(hasPermission(merged, "employees", "view")).toBe(true);
    expect(hasPermission(merged, "employees", "edit")).toBe(true);
    expect(hasPermission(merged, "projects", "view")).toBe(true);
  });

  it("never downgrades a true to false", () => {
    const a: PermissionsMap = { employees: { view: true } };
    const b: PermissionsMap = { employees: { view: false } };
    const merged = mergePermissions(a, b);
    expect(hasPermission(merged, "employees", "view")).toBe(true);
  });

  it("returns an empty-ish map when given nothing", () => {
    const merged = mergePermissions();
    expect(hasPermission(merged, "employees", "view")).toBe(false);
  });
});

describe("PRESETS", () => {
  it("admin can do everything", () => {
    for (const mod of ["employees", "projects", "settings", "ai"] as const) {
      for (const act of ["view", "create", "edit", "delete", "manage"] as const) {
        expect(hasPermission(PRESETS.admin.modules, mod, act)).toBe(true);
      }
    }
  });

  it("employee can view org_chart but not edit it", () => {
    expect(hasPermission(PRESETS.employee.modules, "org_chart", "view")).toBe(true);
    expect(hasPermission(PRESETS.employee.modules, "org_chart", "edit")).toBe(false);
  });

  it("readonly cannot mutate anything", () => {
    expect(hasPermission(PRESETS.readonly.modules, "projects", "create")).toBe(false);
    expect(hasPermission(PRESETS.readonly.modules, "employees", "edit")).toBe(false);
    expect(hasPermission(PRESETS.readonly.modules, "projects", "view")).toBe(true);
  });

  it("manager cannot manage settings", () => {
    expect(hasPermission(PRESETS.manager.modules, "settings", "manage")).toBe(false);
    expect(hasPermission(PRESETS.manager.modules, "employees", "create")).toBe(true);
  });
});
