// Tipos y constantes compartidas del módulo de Proyectos.
// Extraído de page.tsx para reducir el archivo y permitir reuso entre sub-componentes.

export const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = "low" | "medium" | "high" | "urgent";
export type ViewMode = "summary" | "milestones" | "list" | "board";

export const STATUS_LABELS: Record<Status, string> = {
  todo: "Por hacer", in_progress: "En progreso", in_review: "En revisión", done: "Completado",
};
export const STATUS_COLORS: Record<Status, string> = {
  todo: "var(--c-text-muted)", in_progress: "var(--c-accent-blue)", in_review: "var(--c-accent-amber)", done: "var(--c-accent-emerald)",
};
export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "var(--c-text-muted)", medium: "var(--c-accent-blue)", high: "var(--c-accent-amber)", urgent: "var(--c-accent-red)",
};
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente",
};

// VFP — la declaración "qué es estar terminado" del proyecto.
// Si está null/incompleta, el proyecto está en "modo planning" y se gatea la creación de tareas.
export interface ProjectVFP {
  producto?: string;
  para?: string;
  quien?: string;
  aDiferenciaDe?: string;
  terminadoCuando?: string;
}
export interface Project {
  id: string; name: string; description?: string;
  vfp?: ProjectVFP | null;
  ownerEmployeeId?: string | null;
  status?: string;
}
export interface Task {
  id: string; projectId: string; organizationId?: string;
  title: string; description?: string; status: Status; priority?: Priority;
  assigneeName?: string;                  // legacy: nombre como string
  assigneeEmployeeId?: string | null;     // correlación con orgchart (preferido)
  milestoneId?: string | null;            // tarea scopeada a entregable
  dueDate?: string; orderIndex?: number;
  sectionName?: string; createdAt?: string;
}
export interface Milestone {
  id: string; title: string; description?: string | null;
  status: "pending" | "in_progress" | "done"; dueDate?: string; orderIndex: number;
  acceptanceCriteria?: string | null;
  ownerEmployeeId?: string | null;
  bpmNodeId?: string | null;
}

// Info del proceso BPM del proyecto (si fue auto-creado por una instancia BPM)
export interface BpmNodeInfo { id: string; label: string; type: string }
export interface ProjectBpmContext {
  hasProcess: boolean;
  nodes: BpmNodeInfo[];
  processName?: string;
  currentNodeId?: string;
  status?: string;
}
export interface Member {
  id: string; employeeId?: string; userId?: string; role: string;
  employee?: { fullName: string; jobTitle?: string; color?: string };
}
export interface Employee { id: string; fullName: string; jobTitle?: string; color?: string }
