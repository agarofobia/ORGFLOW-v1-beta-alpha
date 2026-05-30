// Tipos PUROS del dominio Procesos — sin dependencias de server/DB.
//
// Vive separado de `bpm.ts` (que importa `db`/postgres y NO puede entrar al bundle
// del cliente) para ser la ÚNICA fuente de verdad de las estructuras que se comparten
// entre el editor (cliente), el runtime (TaskRunnerModal) y las rutas de API.
//
// `bpm.ts` re-exporta estos tipos para no romper imports existentes
// (`import type { ProcessNode } from "@/lib/bpm"`). Importá desde acá en código nuevo.

// ─── Formularios dinámicos (modelo "tren de carga") ───────────────────────────
// Campos compartidos a nivel proceso. Cada instancia acumula sus valores en
// processInstances.context = { [fieldId]: value }. La visibilidad por paso y el
// layout visual se definen en cada ProcessNode.layout.

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "file"
  | "currency"
  | "radio"
  | "multiselect";

export interface FormField {
  id: string;                 // estable, generado al crear el campo
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[];         // opciones manuales (select | radio | multiselect)
  source?: "departments" | "employees" | "divisions"; // opciones dinámicas desde la org
  placeholder?: string;
  autoFolder?: string;        // type "file": carpeta destino en Docs al completar
}

// ─── Layout visual de la ventana de un paso (builder estilo Canva, por paso) ──
// Cada elemento se posiciona libre (x,y,w,h) con guías de alineación en el editor.
//  - kind "field":   referencia un FormField del proceso. readOnly = solo lectura en el paso.
//  - kind "title":   encabezado de texto grande.
//  - kind "text":    subtítulo / texto de ayuda.
//  - kind "divider": separador visual.
//  - kind "section": caja de fondo para agrupar campos.
//  - kind "image":   imagen (URL o subida).
// Si un campo NO está en el layout de un paso → no se muestra en ese paso.
export type LayoutElementKind = "field" | "title" | "text" | "divider" | "image" | "section";

// Lógica condicional (mostrar/ocultar por valor). Un elemento con `showWhen`
// solo se renderiza en runtime si la condición se cumple contra los valores cargados.
export type ConditionOperator = "equals" | "notEquals" | "includes" | "isFilled" | "isEmpty";

export interface ShowWhen {
  fieldId: string;            // campo del proceso que dispara la condición
  operator: ConditionOperator;
  value?: string;             // valor a comparar (no aplica a isFilled/isEmpty)
}

export interface LayoutElement {
  id: string;                 // id del elemento de layout (no del campo)
  kind: LayoutElementKind;
  fieldId?: string;           // solo kind "field" → apunta a un FormField del proceso
  text?: string;              // kind "title" | "text" | "section"
  x: number; y: number;       // posición en px dentro del lienzo
  w: number; h: number;       // tamaño en px
  readOnly?: boolean;         // kind "field": solo lectura en este paso
  fontSize?: number;          // kind "title" | "text"
  align?: "left" | "center" | "right";
  vAlign?: "top" | "middle" | "bottom"; // alineación vertical del texto
  fontFamily?: string;        // tipografía (kind title | text)
  src?: string;               // kind "image" → URL de la imagen
  showWhen?: ShowWhen;        // visibilidad condicional (si está, el elemento es condicional)
}

// La evaluación de condiciones vive en `./form-conditions` (módulo puro).

// ─── Topología BPM (persistida en processDefinitions.nodes / .edges) ──────────

export interface ProcessNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  assigneeDeptId?: string;
  serviceAction?: string;
  position?: { x: number; y: number };
  // Layout visual de la ventana de este paso (builder por paso).
  layout?: LayoutElement[];
  // SLA: tiempo esperado para completar este nodo en ms. Null = sin SLA.
  expectedDurationMs?: number | null;
}

export interface ProcessEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}
