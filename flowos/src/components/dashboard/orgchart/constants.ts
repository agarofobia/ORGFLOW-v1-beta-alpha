// Paleta de colores compartida por modales y nodos.
export const COLORS = [
  "#3D7EFF", "#10D9A0", "#F59E0B", "#F43F5E",
  "#A855F7", "#06B6D4", "#84CC16", "#EC4899",
] as const;

// Dimensiones canónicas del organigrama.
// Cualquier cálculo de layout debería usar estas constantes.
export const LAYOUT = {
  HEADER_H: 80,         // alto del header de una división (64 + gap)
  FOOTER_H_ON: 52,      // alto del footer cuando está habilitado
  PADDING: 16,
  DEPT_W: 280,          // ancho default de departamento
  DEPT_H: 200,          // alto default de departamento
  DEPT_GAP: 20,
  DEPT_HEADER_H: 34,    // header del departamento
  EMP_W: 200,           // ancho de tarjeta de empleado
  EMP_H: 70,            // alto de tarjeta de empleado
  EMP_GAP: 12,          // gap vertical entre empleados
  INDENT_PER_LEVEL: 20, // sangría por nivel jerárquico en deptInternalLayout
} as const;
