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
  // Si true, el head se promueve arriba del depto. Si false, queda adentro.
  promoteHead?: boolean;
  // "vertical" | "compact" | "manual"
  layoutMode?: string;
};

// ─── React Flow node data shapes ─────────────────────────────────────────────

export type EmployeeNodeData = {
  fullName: string; jobTitle: string; color: string; status?: string;
  // URL pública de la foto. Si está seteada, reemplaza las iniciales en el avatar.
  imageUrl?: string | null;
  // Rol efectivo computado en computedNodes (auto-detect + override).
  // Solo se renderiza badge cuando es "director" o "manager".
  role?: "director" | "manager" | "member";
  // departmentId real del empleado (incluso si visualmente está en otro parent,
  // como pasa con los directores promovidos). BicolorEdge lo usa para decidir
  // si la edge entre dos empleados es "interna del depto" (L-line) o externa.
  departmentId?: string | null;
  // Si true, la tarjeta se renderiza en modo compacto (más chica, menos padding).
  // Lo determina el layoutMode del depto contenedor.
  compact?: boolean;
  // Si true, muestra el badge DIR/ENC. Controlado por toggle global del usuario.
  showRoleBadge?: boolean;
  // Si está presente, el card es de un encargado (manager) que absorbió a sus
  // subordinados member. Se renderizan inline como lista dentro del card.
  subordinatesInCard?: Array<{
    id: string;
    fullName: string;
    jobTitle: string;
    color: string;
    isVacant: boolean;
    imageUrl?: string | null;
    unit?: { id: string; name: string; color: string | null; isHead: boolean } | null;
  }>;
  // Unidad a la que pertenece este empleado (cualquier miembro, no solo el head).
  // Si está presente, se muestra un chip clickeable que abre el panel de la unidad.
  unit?: { id: string; name: string; color: string | null; isHead: boolean } | null;
  // Callback para cuando el usuario hace click en el chip de la unidad.
  onUnitClick?: (unitId: string) => void;
  // Callback para cuando el usuario hace click en una fila de subordinado absorbido.
  onSubClick?: (subId: string) => void;
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
