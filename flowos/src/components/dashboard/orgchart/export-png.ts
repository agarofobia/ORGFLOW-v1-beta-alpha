// Export del organigrama completo a PNG. Calcula el bounding box de TODOS los nodos
// (no solo los visibles), fuerza el viewport a ese tamaño y rasteriza el .react-flow__viewport
// con html-to-image. Extraído de orgchart-canvas.tsx. El componente maneja el flag de
// "exportando" y los errores.

import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";

export async function exportOrgChartPng(nodes: Node[]): Promise<void> {
  // Capturar TODOS los nodes (no solo los visibles en el viewport).
  const allNodes = nodes;
  if (allNodes.length === 0) return;
  const bounds = getNodesBounds(allNodes);
  const padding = 60;
  const scale = 1; // 1:1 real-size; pixelRatio multiplica densidad para legibilidad
  const imageWidth = Math.ceil(bounds.width * scale) + padding * 2;
  const imageHeight = Math.ceil(bounds.height * scale) + padding * 2;
  const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 2, padding / imageWidth);

  const viewportEl = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewportEl) return;

  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(viewportEl, {
    backgroundColor: "var(--c-bg-base)",
    width: imageWidth,
    height: imageHeight,
    // pixelRatio 2 = imagen al doble de densidad, ideal para zoom + lectura
    pixelRatio: 2,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    // Filtra paneles flotantes y puntos de conexión (handles) para un PNG limpio.
    // Las edges son SVG paths con coordenadas propias → no dependen del DOM del handle.
    filter: (node) => {
      if (!(node instanceof Element)) return true;
      return !node.classList.contains("react-flow__panel")
          && !node.classList.contains("react-flow__minimap")
          && !node.classList.contains("react-flow__controls")
          && !node.classList.contains("react-flow__handle")
          && !node.classList.contains("orgchart-handle");
    },
  });
  const a = document.createElement("a");
  a.download = `organigrama-${new Date().toISOString().slice(0, 10)}.png`;
  a.href = dataUrl;
  a.click();
}
