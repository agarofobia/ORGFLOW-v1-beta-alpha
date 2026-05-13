import type { Node } from "@xyflow/react";

// ─── Entity types (DB shape) ─────────────────────────────────────────────────

export type Division = {
  id: string; name: string; color: string | null;
  subtitle: string | null; footerText: string | null; showFooter: boolean;
  couplingGroup: string | null;
  seniorEmployeeId: string | null;
  isConnectable: boolean;
  positionX: number | null; positionY: number | null;
  sizeWidth: number | null; sizeHeight: number | null;
};

export type Department = {
  id: string; name: string; divisionId: string | null; color: string | null;
  positionX: number | null; positionY: number | null;
  sizeWidth: number | null; sizeHeight: number | null;
  headEmployeeId: string | null;
};

// ─── React Flow node data shapes ─────────────────────────────────────────────

export type EmployeeNodeData = {
  fullName: string; jobTitle: string; color: string; status?: string;
  // Rol efectivo computado en computedNodes (auto-detect + override).
  // Solo se renderiza badge cuando es "director" o "manager".
  role?: "director" | "manager" | "member";
};

export type DivisionNodeData = {
  name: string; color: string; isDivision: true;
  subtitle?: string | null; footerText?: string | null; showFooter?: boolean;
  adjLeft?: boolean; adjRight?: boolean;
  senior?: { fullName: string; jobTitle?: string | null; color?: string | null } | null;
  isConnectable?: boolean;
  autoSize?: boolean;
  collapsed?: boolean;
  onResize?: (id: string, w: number, h: number) => void;
  onResizeLive?: (id: string, w: number, h: number) => void;
};

export type DepartmentNodeData = {
  name: string; color: string; isDepartment: true;
  head?: { fullName: string; jobTitle?: string | null; color?: string | null } | null;
  employeeCount?: number;
  adjLeft?: boolean; adjRight?: boolean;
  onResize?: (id: string, w: number, h: number) => void;
  onResizeLive?: (id: string, w: number, h: number) => void;
};

export type EmployeeNode = Node<EmployeeNodeData, "employee">;
export type DivisionNode = Node<DivisionNodeData, "division">;
export type DepartmentNode = Node<DepartmentNodeData, "department">;
export type AnyNode = EmployeeNode | DivisionNode | DepartmentNode;
