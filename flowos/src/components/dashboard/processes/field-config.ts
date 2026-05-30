// Catálogo de tipos de campo del formulario del proceso. Compartido por el editor
// de campos (FormFieldsEditor) y el diseñador de ventana (StepLayoutBuilder).
import type { FormFieldType } from "@/lib/process-types";

export const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moneda ($)" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección" },
  { value: "radio", label: "Opción única" },
  { value: "multiselect", label: "Selección múltiple" },
  { value: "checkbox", label: "Checkbox" },
  { value: "file", label: "Archivo" },
];

// Tipos de campo que usan lista de opciones (options / source dinámico).
export const OPTION_FIELD_TYPES: FormFieldType[] = ["select", "radio", "multiselect"];
