import { describe, it, expect } from "vitest";
import { getEffectiveRole } from "./roles";

// Helpers tipados laxos para armar fixtures mínimos
type Emp = { id: string; departmentId?: string | null; managerId?: string | null; role?: string | null };
const emp = (e: Emp) => e;

describe("getEffectiveRole", () => {
  it("respects a manual role override above everything else", () => {
    const e = emp({ id: "e1", departmentId: "d1", role: "manager" });
    const depts = [{ id: "d1", headEmployeeId: "e1" }]; // sería director por estructura
    // override manual gana → manager, no director
    expect(getEffectiveRole(e as never, [e] as never, depts, [])).toBe("manager");
  });

  it("auto-detects director when the employee heads their department", () => {
    const e = emp({ id: "e1", departmentId: "d1", role: null });
    const depts = [{ id: "d1", headEmployeeId: "e1" }];
    expect(getEffectiveRole(e as never, [e] as never, depts, [])).toBe("director");
  });

  it("auto-detects manager when the employee has direct reports", () => {
    const boss = emp({ id: "e1", departmentId: "d1", role: null });
    const report = emp({ id: "e2", departmentId: "d1", managerId: "e1", role: null });
    const depts = [{ id: "d1", headEmployeeId: null }];
    expect(getEffectiveRole(boss as never, [boss, report] as never, depts, [])).toBe("manager");
  });

  it("auto-detects manager when the employee leads a unit", () => {
    const e = emp({ id: "e1", departmentId: "d1", role: null });
    const depts = [{ id: "d1", headEmployeeId: null }];
    const units = [{ headEmployeeId: "e1" }];
    expect(getEffectiveRole(e as never, [e] as never, depts, units)).toBe("manager");
  });

  it("falls back to member when no signal applies", () => {
    const e = emp({ id: "e1", departmentId: "d1", role: null });
    const depts = [{ id: "d1", headEmployeeId: null }];
    expect(getEffectiveRole(e as never, [e] as never, depts, [])).toBe("member");
  });

  it("director (head) takes precedence over having reports", () => {
    const head = emp({ id: "e1", departmentId: "d1", role: null });
    const report = emp({ id: "e2", departmentId: "d1", managerId: "e1", role: null });
    const depts = [{ id: "d1", headEmployeeId: "e1" }];
    expect(getEffectiveRole(head as never, [head, report] as never, depts, [])).toBe("director");
  });
});
