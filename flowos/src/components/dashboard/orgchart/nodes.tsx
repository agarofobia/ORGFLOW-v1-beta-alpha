"use client";

import {
  Handle, Position, NodeResizer, BaseEdge, getSmoothStepPath,
  useReactFlow,
  type NodeProps, type EdgeProps,
} from "@xyflow/react";
import { ChevronRight, FolderPlus } from "lucide-react";
import type { DivisionNode, DepartmentNode, EmployeeNode } from "./types";

// ─── Division (group container) ──────────────────────────────────────────────

export function DivisionNodeView({ id, data, selected }: NodeProps<DivisionNode>) {
  const fineBorder = `1px solid ${selected ? data.color : data.color + "55"}`;
  const noBorder = "none";
  const subtitle = data.subtitle ?? "";
  const showFooter = !!data.showFooter && !!data.footerText?.trim();
  const headerHeight = 64;
  const footerHeight = 40;
  // When adjacent to another division, hide that border so they look fused
  const borderLeftStyle = data.adjLeft ? noBorder : fineBorder;
  const borderRightStyle = data.adjRight ? noBorder : fineBorder;
  const radius = {
    topLeft: data.adjLeft ? 0 : 12,
    topRight: data.adjRight ? 0 : 12,
    bottomLeft: data.adjLeft ? 0 : 12,
    bottomRight: data.adjRight ? 0 : 12,
  };
  return (
    <>
      <NodeResizer
        minWidth={320} minHeight={160}
        isVisible={selected && !data.collapsed}
        lineStyle={{ borderColor: data.color + "80" }}
        handleStyle={{ background: data.color, width: 8, height: 8, borderRadius: 4, border: "none" }}
        onResize={(_, { width, height }) => data.onResizeLive?.(id, width, height)}
        onResizeEnd={(_, { width, height }) => data.onResize?.(id, width, height)}
      />
      <div
        style={{
          width: "100%", height: "100%",
          background: `${data.color}06`,
          borderTop: fineBorder,
          borderRight: borderRightStyle,
          borderBottom: fineBorder,
          borderLeft: borderLeftStyle,
          borderTopLeftRadius: radius.topLeft,
          borderTopRightRadius: radius.topRight,
          borderBottomLeftRadius: radius.bottomLeft,
          borderBottomRightRadius: radius.bottomRight,
          padding: `${headerHeight + 16}px 16px ${showFooter ? footerHeight + 12 : 16}px 16px`,
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        {data.isConnectable !== false && (
          <>
            <Handle type="target" position={Position.Top}
              style={{ background: data.color, width: 10, height: 10, border: "none", top: -1, zIndex: 6 }} />
            <Handle type="source" position={Position.Bottom}
              style={{ background: data.color, width: 10, height: 10, border: "none", bottom: -1, zIndex: 6 }} />
          </>
        )}

        {/* Header centrado al tope */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: headerHeight,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 3,
            borderTopLeftRadius: Math.max(0, radius.topLeft - 1),
            borderTopRightRadius: Math.max(0, radius.topRight - 1),
            background: `linear-gradient(180deg, ${data.color}28 0%, ${data.color}10 100%), #0A0F1C`,
            borderBottom: `1px solid ${data.color}40`,
            pointerEvents: "none",
            padding: "0 12px",
            zIndex: 5,
          }}
        >
          <span style={{
            fontSize: 15, fontWeight: 700, color: data.color,
            letterSpacing: "0.02em",
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {data.collapsed && <ChevronRight size={14} style={{ flexShrink: 0 }} />}
            {data.name}
          </span>
          {subtitle && !data.collapsed && (
            <span style={{
              fontSize: 9, color: data.color + "BB", fontFamily: "monospace",
              textTransform: "uppercase", letterSpacing: "0.12em",
              maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </span>
          )}
        </div>

        {/* Senior slot (esquina top-right) */}
        {data.senior && (
          <div
            style={{
              position: "absolute", top: 8, right: 12,
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 10px 4px 4px",
              background: "#0E1220EE",
              border: `1px solid ${(data.senior.color ?? data.color) + "55"}`,
              borderRadius: 22,
              zIndex: 7,
              maxWidth: "40%",
              pointerEvents: "none",
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: (data.senior.color ?? data.color) + "33",
              border: `2px solid ${data.senior.color ?? data.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: data.senior.color ?? data.color,
              flexShrink: 0,
            }}>
              {data.senior.fullName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
            </div>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: "#E2E8F8",
                maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {data.senior.fullName}
              </span>
              {data.senior.jobTitle && (
                <span style={{
                  fontSize: 9, color: "#7A8BAD",
                  maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {data.senior.jobTitle}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer opcional */}
        {showFooter && (
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              height: footerHeight,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 14px",
              borderBottomLeftRadius: Math.max(0, radius.bottomLeft - 1),
              borderBottomRightRadius: Math.max(0, radius.bottomRight - 1),
              background: `${data.color}10`,
              borderTop: `1px solid ${data.color}30`,
              pointerEvents: "none",
              fontSize: 11, color: data.color + "DD",
              fontStyle: "italic",
              textAlign: "center",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {data.footerText}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Department (small container) ────────────────────────────────────────────

export function DepartmentNodeView({ id, data, selected }: NodeProps<DepartmentNode>) {
  const fineBorder = `1px solid ${selected ? data.color : data.color + "44"}`;
  const noBorder = "none";
  const borderLeftStyle = data.adjLeft ? noBorder : fineBorder;
  const borderRightStyle = data.adjRight ? noBorder : fineBorder;
  const radius = {
    topLeft: data.adjLeft ? 0 : 8,
    topRight: data.adjRight ? 0 : 8,
    bottomLeft: data.adjLeft ? 0 : 8,
    bottomRight: data.adjRight ? 0 : 8,
  };
  return (
    <>
      <NodeResizer
        minWidth={180} minHeight={100}
        isVisible={selected}
        lineStyle={{ borderColor: data.color + "80" }}
        handleStyle={{ background: data.color, width: 7, height: 7, borderRadius: 3, border: "none" }}
        onResize={(_, { width, height }) => data.onResizeLive?.(id, width, height)}
        onResizeEnd={(_, { width, height }) => data.onResize?.(id, width, height)}
      />
      <Handle type="target" position={Position.Top}
        style={{ background: data.color, width: 8, height: 8, border: "none", top: -1, zIndex: 6 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: data.color, width: 8, height: 8, border: "none", bottom: -1, zIndex: 6 }} />
      <div
        style={{
          width: "100%", height: "100%",
          background: `${data.color}06`,
          borderTop: fineBorder,
          borderRight: borderRightStyle,
          borderBottom: fineBorder,
          borderLeft: borderLeftStyle,
          borderTopLeftRadius: radius.topLeft,
          borderTopRightRadius: radius.topRight,
          borderBottomLeftRadius: radius.bottomLeft,
          borderBottomRightRadius: radius.bottomRight,
          padding: "34px 10px 10px 10px",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: 28,
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 6px",
            borderTopLeftRadius: Math.max(0, radius.topLeft - 1),
            borderTopRightRadius: Math.max(0, radius.topRight - 1),
            // Base sólida #0A0F1C + tint del color para que los edges no
            // se vean a través del header.
            background: `linear-gradient(180deg, ${data.color}26 0%, ${data.color}10 100%), #0A0F1C`,
            borderBottom: `1px solid ${data.color}40`,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <FolderPlus size={10} style={{ color: data.color, flexShrink: 0 }} />
          <span style={{
            flex: 1, fontSize: 11, fontWeight: 700, color: data.color,
            textTransform: "uppercase", letterSpacing: "0.06em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {data.name}
          </span>
          {typeof data.employeeCount === "number" && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: data.color,
              background: data.color + "22",
              border: `1px solid ${data.color}44`,
              borderRadius: 10, padding: "1px 5px",
              fontFamily: "monospace", flexShrink: 0,
            }}>
              {data.employeeCount}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Employee card ───────────────────────────────────────────────────────────

export function EmployeeNodeView({ data, selected }: NodeProps<EmployeeNode>) {
  const isVacant = data.fullName === "[Puesto vacante]";
  const initials = isVacant
    ? "?"
    : data.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  // Vacantes: dashed border + leve transparencia para distinguirlos sin
  // hacerlos ilegibles.
  const sideBorderColor = selected ? data.color : (isVacant ? data.color + "66" : data.color + "55");
  const sideBorderStyle = isVacant ? "dashed" : "solid";
  // Borde más grueso para directores/encargados — jerarquía visual sin agrandar el card.
  const isDirector = data.role === "director";
  const isManager = data.role === "manager";
  const borderWeight = selected ? "2px" : isDirector ? "2px" : "1px";
  const sideBorder = `${borderWeight} ${sideBorderStyle} ${sideBorderColor}`;
  const leftBorderWeight = isDirector ? "5px" : isManager ? "4px" : "3px";
  const roleBadge = isDirector ? "DIR" : isManager ? "ENC" : null;
  return (
    <div
      className="flex items-center gap-3 transition-shadow hover:shadow-lg"
      style={{
        width: 200,
        padding: 10,
        background: isVacant ? "#0E122099" : "#0E1220",
        borderTop: sideBorder,
        borderRight: sideBorder,
        borderBottom: sideBorder,
        borderLeft: `${leftBorderWeight} ${sideBorderStyle} ${data.color}`,
        borderRadius: 6,
        opacity: isVacant ? 0.85 : 1,
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color, width: 8, height: 8, border: "none" }} />
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center text-xs font-semibold text-white"
        style={{ background: isVacant ? "#7A8BAD" : data.color, borderRadius: 6 }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: isVacant ? "#7A8BAD" : "#E2E8F8" }}>
          {isVacant ? "Puesto vacante" : data.fullName}
        </div>
        <div className="truncate text-xs" style={{ color: "#7A8BAD" }}>
          {data.jobTitle}
        </div>
      </div>
      {roleBadge && (
        <span style={{
          position: "absolute", top: -7, right: 6,
          fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
          padding: "2px 5px", borderRadius: 8,
          background: data.color, color: "#0A0F1C",
          fontFamily: "monospace",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}>
          {roleBadge}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 8, height: 8, border: "none" }} />
    </div>
  );
}

// ─── Bicolor edge ────────────────────────────────────────────────────────────

export const BicolorEdge = ({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  source, target,
  markerEnd,
}: EdgeProps) => {
  const { getNodes } = useReactFlow();
  const nodes = getNodes();
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  const sourceColor = (sourceNode?.data as { color?: string })?.color ?? "#3D7EFF";
  const targetColor = (targetNode?.data as { color?: string })?.color ?? "#3D7EFF";
  const gradientId = `bg-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`;

  // L-lines (ángulos rectos puros) cuando:
  //   a) ambos nodos son empleados del MISMO depto (incluso si parent visual difiere,
  //      como pasa con un director promovido conectando a un encargado interno)
  //   b) la edge es sintética director→depto o manager→subordinado (__sync_*)
  // Para conexiones externas (división→director sin parent común, edges manuales)
  // se mantiene el smoothstep curvado clásico.
  const sourceDeptId = (sourceNode?.data as { departmentId?: string | null })?.departmentId;
  const targetDeptId = (targetNode?.data as { departmentId?: string | null })?.departmentId;
  const isSameDeptEmpEdge =
    sourceNode?.type === "employee" &&
    targetNode?.type === "employee" &&
    !!sourceDeptId &&
    sourceDeptId === targetDeptId;
  const isSyntheticEdge = id.startsWith("__sync_");
  const useStraightCorners = isSameDeptEmpEdge || isSyntheticEdge;

  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: useStraightCorners ? 0 : 8,
  });

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY}
          x2={targetX} y2={targetY}
        >
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: `url(#${gradientId})`, strokeWidth: 1.5 }}
      />
    </>
  );
};

// ─── Maps que ReactFlow usa para resolver tipos ──────────────────────────────

export const nodeTypes = {
  employee: EmployeeNodeView,
  division: DivisionNodeView,
  department: DepartmentNodeView,
};

export const edgeTypes = { bicolor: BicolorEdge };
