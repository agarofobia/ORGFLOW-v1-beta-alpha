// Undo / Redo de posiciones de nodos del orgchart. Mantiene los stacks + atajos de
// teclado (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y). La aplicación real del movimiento (fetch +
// setState) la inyecta el componente vía `applyMove`, porque necesita los setters de
// estado. Extraído de orgchart-canvas.tsx.

import { useCallback, useEffect, useState } from "react";

export type MoveOp = {
  entityType: "employee" | "division" | "department";
  id: string;
  fromX: number; fromY: number;
  toX: number; toY: number;
};

export function useUndoRedo(applyMove: (op: MoveOp, useFromPos: boolean) => void) {
  const [undoStack, setUndoStack] = useState<MoveOp[]>([]);
  const [redoStack, setRedoStack] = useState<MoveOp[]>([]);

  const recordMove = useCallback((op: MoveOp) => {
    setUndoStack(prev => {
      const next = [...prev, op];
      return next.length > 50 ? next.slice(-50) : next;
    });
    setRedoStack([]); // nueva acción → invalida el redo
  }, []);

  const doUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const op = prev[prev.length - 1];
      applyMove(op, true);
      setRedoStack(r => [...r, op]);
      return prev.slice(0, -1);
    });
  }, [applyMove]);

  const doRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const op = prev[prev.length - 1];
      applyMove(op, false);
      setUndoStack(u => [...u, op]);
      return prev.slice(0, -1);
    });
  }, [applyMove]);

  // Ctrl+Z / Ctrl+Shift+Z atajos
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doUndo, doRedo]);

  return { recordMove, doUndo, doRedo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}
