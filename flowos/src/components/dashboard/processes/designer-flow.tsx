"use client";

// Editor BPM interno (vive dentro de un ReactFlowProvider): paleta de nodos, lienzo
// ReactFlow, panel de propiedades del nodo, editor de campos del proceso (modal) y
// diseñador de ventana por paso (StepLayoutBuilder). Maneja el estado dirty + guardado.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  addEdge,
  type Edge,
  type Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save, Loader2, X } from "lucide-react";
import type { ProcessDefinition } from "@/db/schema";
import type { FormField, ProcessNode, ProcessEdge } from "@/lib/process-types";
import {
  nodeTypes,
  PALETTE,
  nodesToDB,
  nodesFromDB,
  edgesToDB,
  edgesFromDB,
  type BpmData,
  type BpmNode,
} from "./process-flow";
import { StepLayoutBuilder } from "./step-layout-builder";
import { PropertiesPanel } from "./properties-panel";

export function DesignerFlow({
  definition,
  onSave,
  saving,
  onDirtyChange,
  heatmapData,
}: {
  definition: ProcessDefinition;
  onSave: (nodes: ProcessNode[], edges: ProcessEdge[], formFields: FormField[]) => Promise<void>;
  saving: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  heatmapData?: Record<string, { color: string; label: string }>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<BpmNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<BpmNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  // Campos del formulario a nivel PROCESO (modelo "tren de carga"): se definen
  // una vez para el proceso y cada instancia acumula sus valores. La visibilidad
  // por paso (qué campos ve cada nodo) llega en Fase 2.
  const [formFields, setFormFields] = useState<FormField[]>([]);
  // Nodo cuyo layout visual se está diseñando (builder estilo Canva por paso).
  const [layoutBuilderNodeId, setLayoutBuilderNodeId] = useState<string | null>(null);
  // Track cambios sin guardar — se setea true en cualquier mutación post-load.
  // Se resetea cuando definition cambia (load nuevo o post-save trae fresh).
  const [isDirty, setIsDirty] = useState(false);
  // notify parent on dirty changes (para showar "● Cambios sin guardar" en topbar fuera de este componente)
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const dbNodes = definition.nodes as unknown as ProcessNode[];
    const dbEdges = definition.edges as unknown as ProcessEdge[];
    setNodes(nodesFromDB(Array.isArray(dbNodes) ? dbNodes : []));
    setEdges(edgesFromDB(Array.isArray(dbEdges) ? dbEdges : []));
    const dbFields = definition.formFields as unknown as FormField[];
    setFormFields(Array.isArray(dbFields) ? dbFields : []);
    // El load (inicial o post-save) limpia el dirty flag.
    setIsDirty(false);
  }, [definition.id, definition.nodes, definition.edges, definition.formFields, setNodes, setEdges]);

  // Aplicar/quitar heatmap: cuando cambia heatmapData, inyectamos heatBorder
  // en cada node.data sin alterar la posición ni otros campos. Esto NO marca dirty.
  useEffect(() => {
    setNodes((curr) =>
      curr.map((n) => {
        const hit = heatmapData?.[n.id];
        if (hit) {
          return { ...n, data: { ...n.data, heatBorder: hit.color, heatLabel: hit.label } };
        }
        if (n.data.heatBorder || n.data.heatLabel) {
          // Remover heat si ya no aplica
          const cleaned = { ...n.data };
          delete cleaned.heatBorder;
          delete cleaned.heatLabel;
          return { ...n, data: cleaned };
        }
        return n;
      })
    );
  }, [heatmapData, setNodes]);

  // Wrap onNodesChange para detectar mutaciones persistentes (no "select" / "dimensions").
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes);
    const persistent = changes.some(c => c.type === "position" || c.type === "remove" || c.type === "add" || c.type === "replace");
    if (persistent) setIsDirty(true);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    onEdgesChange(changes);
    const persistent = changes.some(c => c.type === "remove" || c.type === "add" || c.type === "replace");
    if (persistent) setIsDirty(true);
  }, [onEdgesChange]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // Detectar si el source es un exclusiveGateway para pedir condición
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isGateway = sourceNode?.type === "exclusiveGateway";
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            style: { stroke: isGateway ? "var(--c-accent-red)" : "var(--c-accent-blue)", strokeWidth: 1.5 },
            label: isGateway ? "condición" : undefined,
            data: { condition: isGateway ? "" : undefined },
          },
          eds
        )
      );
      setIsDirty(true);
    },
    [setEdges, nodes]
  );

  const addNode = (type: string, defaultLabel: string) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const offset = nodes.length * 20;
    const id = `${type}-${Date.now()}`;
    const newNode: BpmNode = {
      id,
      type,
      position: { x: center.x - 80 + offset, y: center.y - 40 + offset },
      data: { label: defaultLabel },
    };
    setNodes((nds) => [...nds, newNode]);
    setIsDirty(true);
  };

  const updateNodeData = (id: string, data: Partial<BpmData>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n))
    );
    if (selectedNode?.id === id) {
      setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, ...data } } : null);
    }
    setIsDirty(true);
  };

  const updateEdgeCondition = (edgeId: string, condition: string) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? { ...e, label: condition || "condición", data: { ...((e.data as Record<string, unknown>) ?? {}), condition } }
          : e
      )
    );
    setSelectedEdge((prev) =>
      prev?.id === edgeId
        ? { ...prev, label: condition || "condición", data: { ...((prev.data as Record<string, unknown>) ?? {}), condition } }
        : prev
    );
    setIsDirty(true);
  };

  // beforeunload guard — alerta al user antes de cerrar pestaña si tiene cambios sin guardar.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // En navegadores modernos el string es ignorado, pero la promesa de bloqueo se respeta.
      e.returnValue = "Tenés cambios sin guardar en el proceso. ¿Salir igual?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Ctrl+S / Cmd+S → guardar. No interferimos si el user está tipeando en un input.
  // Esc → cierra paneles laterales abiertos (nodo o edge).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saving) onSave(nodesToDB(nodes), edgesToDB(edges), formFields);
      }
      if (e.key === "Escape" && (selectedNode || selectedEdge)) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, saving, nodes, edges, formFields, onSave, selectedNode, selectedEdge]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: BpmNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    // Solo permitir edición en edges de exclusiveGateway
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (sourceNode?.type === "exclusiveGateway") {
      setSelectedEdge(edge);
      setSelectedNode(null);
    }
  }, [nodes]);

  const handleSave = () => onSave(nodesToDB(nodes), edgesToDB(edges), formFields);

  // Mutación de los campos del formulario del proceso → marca dirty.
  const handleFormFieldsChange = (fields: FormField[]) => {
    setFormFields(fields);
    setIsDirty(true);
  };

  // Uso de cada campo a lo largo del proceso: en cuántos PASOS (nodos) aparece.
  // Permite mostrar "usado en N pasos / sin usar" en la paleta del diseñador.
  const fieldUsage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of nodes) {
      const lay = n.data.layout ?? [];
      const seen = new Set<string>();
      for (const el of lay) {
        if (el.kind === "field" && el.fieldId && !seen.has(el.fieldId)) {
          seen.add(el.fieldId);
          m[el.fieldId] = (m[el.fieldId] ?? 0) + 1;
        }
      }
    }
    return m;
  }, [nodes]);

  // Borra un campo del PROCESO entero: lo saca del catálogo y de todos los pasos.
  const deleteProcessField = (fieldId: string) => {
    setNodes((nds) => nds.map((n) => {
      const lay = n.data.layout;
      if (!lay || !lay.some((el) => el.fieldId === fieldId)) return n;
      return { ...n, data: { ...n.data, layout: lay.filter((el) => el.fieldId !== fieldId) } };
    }));
    setFormFields((prev) => prev.filter((f) => f.id !== fieldId));
    setIsDirty(true);
  };

  return (
    <div className="relative flex h-full w-full">
      {/* Palette */}
      <div
        className="flex flex-col gap-1 p-3"
        style={{
          width: 180,
          background: "var(--c-bg-base)",
          borderRight: "1px solid var(--c-border)",
          flexShrink: 0,
        }}
      >
        <p
          className="mb-2 px-1 font-mono text-[9px] uppercase tracking-widest"
          style={{ color: "var(--c-text-muted)" }}
        >
          Elementos
        </p>
        {PALETTE.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              onClick={() => addNode(item.type, item.defaultLabel)}
              className="flex items-center gap-2 rounded px-2 py-2 text-left text-xs transition-colors hover:bg-[var(--c-bg-elevated)]"
              style={{ color: "var(--c-text-secondary)" }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}

        <div style={{ height: 1, background: "var(--c-border)", margin: "8px 0" }} />

        <div className="flex flex-col gap-1.5 px-1 font-mono text-[9px]" style={{ color: "var(--c-text-muted)", lineHeight: 1.5 }}>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Conectar</strong>: arrastrar desde los handles azules.</p>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Borrar</strong>: seleccionar + tecla Delete.</p>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Editar</strong>: click en nodo → panel lateral.</p>
          <p><strong style={{ color: "var(--c-text-secondary)" }}>Guardar</strong>: Ctrl+S o botón.</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
          nodeTypes={nodeTypes}
          deleteKeyCode="Delete"
          fitView
          proOptions={{ hideAttribution: true }}
          panOnDrag={[0, 1, 2]}
          zoomOnPinch={true}
          minZoom={0.2}
          maxZoom={2}
          style={{ background: "var(--c-bg-base)" }}
        >
          <Background color="var(--c-border)" gap={32} size={1} />
          <Controls style={{ background: "var(--c-bg-surface)", border: "1px solid var(--c-border)" }} />
          <Panel position="top-right" className="m-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                title={isDirty ? "Guardar cambios (Ctrl+S)" : "Sin cambios pendientes"}
                className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: isDirty ? "var(--c-accent-blue)" : "var(--c-border)",
                  boxShadow: isDirty ? "0 0 12px rgb(var(--c-accent-blue-rgb) / 0.3)" : "none",
                }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" strokeWidth={2} />
                )}
                {isDirty ? "Guardar" : "Guardado"}
              </button>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Properties panel — nodo */}
      {selectedNode && (
        <div className="absolute right-4 top-4 z-10">
          <PropertiesPanel
            node={selectedNode}
            allNodes={nodes.map((n) => ({ id: n.id, label: n.data.label, type: n.type ?? "" }))}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
            onOpenLayoutBuilder={() => setLayoutBuilderNodeId(selectedNode.id)}
          />
        </div>
      )}


      {/* Step Layout Builder — diseñador visual de la ventana de un paso */}
      {layoutBuilderNodeId && (() => {
        const bn = nodes.find((n) => n.id === layoutBuilderNodeId);
        if (!bn) return null;
        return (
          <StepLayoutBuilder
            nodeLabel={bn.data.label}
            processFields={formFields}
            layout={bn.data.layout ?? []}
            onChange={(lay) => updateNodeData(bn.id, { layout: lay })}
            onCreateField={handleFormFieldsChange}
            fieldUsage={fieldUsage}
            onDeleteField={deleteProcessField}
            onClose={() => setLayoutBuilderNodeId(null)}
          />
        );
      })()}

      {/* Edge condition panel — solo para exclusiveGateway */}
      {selectedEdge && (
        <div className="absolute right-4 top-4 z-10">
          <div style={{ width: 240, background: "var(--c-bg-surface)", border: "1px solid rgb(var(--c-accent-red-rgb) / 0.25)", borderRadius: 8, padding: 16 }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--c-accent-red)" }}>
                Condición de decisión
              </p>
              <button onClick={() => setSelectedEdge(null)} className="rounded p-1 hover:bg-[var(--c-border)]" style={{ color: "var(--c-text-muted)" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
              Define cuándo el flujo toma esta rama. Ej: <code style={{ color: "var(--c-accent-red)" }}>aprobado === true</code>
            </p>
            <textarea
              autoFocus
              rows={3}
              value={((selectedEdge.data as Record<string, unknown>)?.condition as string) ?? ""}
              onChange={(e) => updateEdgeCondition(selectedEdge.id, e.target.value)}
              placeholder="ej: monto > 10000"
              className="w-full resize-none rounded px-3 py-2 text-sm outline-none placeholder:text-[var(--c-text-placeholder)]"
              style={{ background: "var(--c-bg-elevated)", border: "1px solid var(--c-border)", color: "var(--c-text-primary)" }}
            />
            <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--c-text-placeholder)" }}>
              La condición se muestra como etiqueta en la conexión
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
