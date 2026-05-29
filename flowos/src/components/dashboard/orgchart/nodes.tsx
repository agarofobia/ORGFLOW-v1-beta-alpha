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
  const subtitle = data.subtitle ?? "";
  const showFooter = !!data.showFooter && !!data.footerText?.trim();
  const headerHeight = 64;
  const footerHeight = 40;
  // Frontera entre divisiones adyacentes: ambos lados mantienen su borde del
  // propio color → divider bicolor de 2px que muestra los colores de cada lado.
  const borderLeftStyle = fineBorder;
  const borderRightStyle = fineBorder;
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
        handleStyle={{ background: data.color, width: 6, height: 6, borderRadius: 4, border: "none" }}
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
              className="orgchart-handle"
              style={{
                background: data.color,
                width: 6, height: 6, border: "none", top: -3, zIndex: 6,
              }} />
            <Handle type="source" position={Position.Bottom}
              className="orgchart-handle"
              style={{
                background: data.color,
                width: 6, height: 6, border: "none", bottom: -3, zIndex: 6,
              }} />
          </>
        )}

        {/* Header centrado al tope — único punto draggeable de la división.
            Esto deja que el body permita pan del canvas (drag-to-pan). */}
        <div
          className="division-drag-handle"
          style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: headerHeight,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 3,
            borderTopLeftRadius: Math.max(0, radius.topLeft - 1),
            borderTopRightRadius: Math.max(0, radius.topRight - 1),
            background: `linear-gradient(180deg, ${data.color}28 0%, ${data.color}10 100%), var(--c-bg-darker)`,
            borderBottom: `1px solid ${data.color}40`,
            cursor: "grab",
            padding: "0 12px",
            zIndex: 5,
            pointerEvents: "auto",
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
  // Depts adyacentes: esconder el border del lado compartido para evitar el
  // solapamiento visual de 2px. El dept derecho oculta su borde izquierdo;
  // el dept izquierdo oculta su borde derecho. Resultado: 0px seam limpio.
  const borderLeftStyle = data.adjLeft ? "none" : fineBorder;
  const borderRightStyle = data.adjRight ? "none" : fineBorder;
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
      {/* Handles del depto: visibles solo en hover/selected (CSS global) */}
      <Handle type="target" position={Position.Top}
        className="orgchart-handle"
        style={{
          background: data.color,
          width: 6, height: 6, border: "none", top: -3, zIndex: 6,
        }} />
      <Handle type="source" position={Position.Bottom}
        className="orgchart-handle"
        style={{
          background: data.color,
          width: 6, height: 6, border: "none", bottom: -3, zIndex: 6,
        }} />
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
          className="department-drag-handle"
          style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: 28,
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 6px",
            borderTopLeftRadius: Math.max(0, radius.topLeft - 1),
            borderTopRightRadius: Math.max(0, radius.topRight - 1),
            // Fondo 100% opaco para que edges no se vean atrás del header.
            background: `linear-gradient(180deg,
              color-mix(in srgb, ${data.color} 18%, var(--c-bg-darker)) 0%,
              color-mix(in srgb, ${data.color} 8%, var(--c-bg-darker)) 100%)`,
            borderBottom: `1px solid ${data.color}40`,
            cursor: "grab",
            // zIndex alto + isolation del padre: queda encima de contenido interno.
            zIndex: 10,
            pointerEvents: "auto",
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
  const isCompact = data.compact === true;
  const showBadge = data.showRoleBadge === true;
  const subordinates = data.subordinatesInCard ?? [];
  const hasSubsInside = subordinates.length > 0;

  const initials = isVacant
    ? "?"
    : (data.fullName ?? "").split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

  const sideBorderColor = selected ? data.color : (isVacant ? data.color + "66" : data.color + "55");
  const sideBorderStyle = "solid" as const;
  const isDirector = data.role === "director";
  const isManager = data.role === "manager";
  const borderWeight = selected ? "2px" : (showBadge && isDirector) ? "2px" : "1px";
  const sideBorder = `${borderWeight} ${sideBorderStyle} ${sideBorderColor}`;
  const leftBorderWeight = showBadge
    ? (isDirector ? "5px" : isManager ? "4px" : "3px")
    : "3px";
  const roleBadge = showBadge ? (isDirector ? "DIR" : isManager ? "ENC" : null) : null;

  const cardPad = isCompact ? 6 : 10;
  const avatarSize = isCompact ? 26 : 36;
  const fontSizeName = isCompact ? 11 : 14;

  return (
    <div
      className="transition-shadow hover:shadow-lg"
      style={{
        width: 200,
        background: isVacant && !hasSubsInside ? "rgb(var(--c-bg-surface-rgb) / 0.6)" : "var(--c-bg-surface)",
        borderTop: sideBorder,
        borderRight: sideBorder,
        borderBottom: sideBorder,
        borderLeft: `${leftBorderWeight} ${sideBorderStyle} ${data.color}`,
        borderRadius: 6,
        opacity: isVacant && !hasSubsInside ? 0.85 : 1,
        position: "relative",
        // overflow visible para que los handles no queden cortados a la mitad.
        // El border-radius lo respetamos solo en el header con clip-path implícito.
      }}
    >
      {/* Header del card — info del puesto principal */}
      <div className="flex items-center gap-2" style={{ padding: cardPad }}>
        <Handle type="target" position={Position.Top}
          id="top"
          className="orgchart-handle"
          style={{
            background: data.color,
            width: 6, height: 6, border: "none", top: -3,
          }} />
        {/* Handle lateral izquierdo — usado por edges sintéticas manager→subordinado
            para que las líneas internas del depto vayan por el costado (más limpio
            visualmente que entrar siempre por arriba). */}
        <Handle type="target" position={Position.Left}
          id="left"
          className="orgchart-handle"
          style={{
            background: data.color,
            width: 6, height: 6, border: "none", left: -3,
          }} />
        {data.imageUrl && !isVacant ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.imageUrl}
            alt={data.fullName}
            style={{
              width: avatarSize, height: avatarSize,
              borderRadius: 6,
              objectFit: "cover",
              border: `1.5px solid ${data.color}`,
              flexShrink: 0,
              display: "block",
            }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="flex flex-shrink-0 items-center justify-center font-semibold"
            style={{
              background: isVacant ? "transparent" : data.color,
              border: isVacant ? "1.5px dashed rgb(122 139 173 / 0.4)" : "none",
              color: isVacant ? "var(--c-text-muted)" : "#fff",
              borderRadius: 6,
              width: avatarSize, height: avatarSize,
              fontSize: isCompact ? 9 : 12,
            }}
          >
            {isVacant ? "+" : initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* Para vacantes: jobTitle prominente arriba, "Vacante" como label pequeño abajo.
              Para ocupados: fullName arriba, jobTitle abajo. Más fácil escanear quién es quién. */}
          <div className="truncate font-medium" style={{ color: isVacant ? "var(--c-text-muted)" : "var(--c-text-primary)", fontSize: fontSizeName, lineHeight: 1.15, fontStyle: isVacant ? "italic" : "normal" }}>
            {isVacant ? (data.jobTitle || "Puesto sin definir") : data.fullName}
          </div>
          {(!isCompact || isVacant) && (
            <div className="truncate" style={{ color: isVacant ? "var(--c-text-muted)" : "var(--c-text-muted)", fontSize: isCompact ? 9 : 11, fontFamily: isVacant ? "monospace" : "inherit", textTransform: isVacant ? "uppercase" : "none", letterSpacing: isVacant ? "0.08em" : "normal" }}>
              {isVacant ? "Vacante" : data.jobTitle}
            </div>
          )}
        </div>
      </div>

      {/* Lista de subordinados — solo si el manager los "absorbió" */}
      {hasSubsInside && (
        <div style={{
          borderTop: `1px dashed ${data.color}44`,
          background: "rgba(20, 25, 40, 0.4)",
          padding: "4px 6px 6px 6px",
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
        }}>
          {subordinates.map(sub => {
            const subInitials = sub.isVacant
              ? "+"
              : (sub.fullName ?? "").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
            return (
              <div
                key={sub.id}
                className="flex items-center gap-2 hover:bg-[rgb(var(--c-accent-blue-rgb) / 0.08)]"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); data.onSubClick?.(sub.id); }}
                style={{
                  padding: "3px 4px",
                  opacity: sub.isVacant ? 0.7 : 1,
                  borderRadius: 4,
                  cursor: "pointer",
                  transition: "background 120ms ease",
                }}
                title="Click para editar este puesto"
              >
                {sub.imageUrl && !sub.isVacant ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sub.imageUrl}
                    alt={sub.fullName}
                    style={{
                      width: 18, height: 18,
                      borderRadius: 4,
                      objectFit: "cover",
                      border: `1px solid ${sub.color}`,
                      flexShrink: 0,
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    className="flex flex-shrink-0 items-center justify-center text-white"
                    style={{
                      background: sub.isVacant ? "var(--c-text-muted)" : sub.color,
                      borderRadius: 4,
                      width: 18, height: 18,
                      fontSize: 8, fontWeight: 600,
                    }}
                  >
                    {subInitials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ color: sub.isVacant ? "var(--c-text-muted)" : "var(--c-text-secondary)", fontSize: 11, lineHeight: 1.15 }}>
                    {sub.isVacant ? sub.jobTitle : sub.fullName}
                  </div>
                  {!sub.isVacant && (
                    <div className="truncate" style={{ color: "var(--c-text-muted)", fontSize: 9, lineHeight: 1.1 }}>
                      {sub.jobTitle}
                    </div>
                  )}
                </div>
                {sub.unit && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); data.onUnitClick?.(sub.unit!.id); }}
                    title={`Unidad: ${sub.unit.name}${sub.unit.isHead ? " (jefe)" : ""} — click para editar`}
                    style={{
                      display: "flex", alignItems: "center", gap: 3,
                      padding: "1px 5px",
                      borderRadius: 8,
                      border: `1px ${sub.unit.isHead ? "solid" : "dashed"} ${(sub.unit.color ?? sub.color) + (sub.unit.isHead ? "AA" : "55")}`,
                      background: (sub.unit.color ?? sub.color) + (sub.unit.isHead ? "1F" : "10"),
                      color: sub.unit.color ?? sub.color,
                      fontSize: 8, fontWeight: 600, letterSpacing: "0.03em",
                      textTransform: "uppercase" as const,
                      cursor: "pointer",
                      fontFamily: "monospace",
                      flexShrink: 0,
                      maxWidth: 70,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      opacity: sub.unit.isHead ? 1 : 0.85,
                    }}
                  >
                    <span style={{ fontSize: 7 }}>⬡</span>
                    {sub.unit.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Chip de unidad — visible para todos los miembros; head con borde sólido, miembros con dashed */}
      {data.unit && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); data.onUnitClick?.(data.unit!.id); }}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            margin: "0 8px 6px",
            padding: "2px 7px",
            borderRadius: 10,
            border: `1px ${data.unit.isHead ? "solid" : "dashed"} ${(data.unit.color ?? data.color) + (data.unit.isHead ? "AA" : "55")}`,
            background: (data.unit.color ?? data.color) + (data.unit.isHead ? "1F" : "10"),
            color: data.unit.color ?? data.color,
            fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
            cursor: "pointer",
            fontFamily: "monospace",
            width: "calc(100% - 16px)",
            textAlign: "left" as const,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            opacity: data.unit.isHead ? 1 : 0.85,
          }}
          title={`Unidad: ${data.unit.name}${data.unit.isHead ? " (jefe)" : ""} — click para editar`}
        >
          <span style={{ fontSize: 8, flexShrink: 0 }}>⬡</span>
          {data.unit.name}
        </button>
      )}

      {roleBadge && (
        <span style={{
          position: "absolute", top: -7, right: 6,
          fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
          padding: "2px 5px", borderRadius: 8,
          background: data.color, color: "var(--c-bg-darker)",
          fontFamily: "monospace",
          boxShadow: "0 1px 4px var(--c-shadow-medium)",
          pointerEvents: "none",
        }}>
          {roleBadge}
        </span>
      )}
      <Handle type="source" position={Position.Bottom}
        className="orgchart-handle"
        style={{
          background: data.color,
          width: 6, height: 6, border: "none", bottom: -3,
        }} />
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

  const sourceColor = (sourceNode?.data as { color?: string })?.color ?? "var(--c-accent-blue)";
  const targetColor = (targetNode?.data as { color?: string })?.color ?? "var(--c-accent-blue)";
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

  // borderRadius 8 siempre: tanto las L-lines internas como las edges externas
  // tienen esquinas redondeadas. Suavizado consistente.
  // useStraightCorners se mantiene en la lógica de detección por si después
  // se diferencia con otro estilo, pero ahora ambos casos usan el mismo radius.
  void useStraightCorners;
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
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
        interactionWidth={40}
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
