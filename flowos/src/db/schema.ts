import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  doublePrecision,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
  "on_leave",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "in_review",
  "done",
]);
export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "owner",
  "member",
  "viewer",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "in_progress",
  "done",
]);
export const permissionSubjectTypeEnum = pgEnum("permission_subject_type", [
  "user",
  "employee",
  "department",
  "division",
]);
export const documentGranteeTypeEnum = pgEnum("document_grantee_type", [
  "user",
  "employee",
  "department",
  "division",
]);

// ─── Organizations ───────────────────────────────────────────────────────────
// Sincronizado desde Clerk via webhooks. clerk_id es la PK lógica.

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  imageUrl: text("image_url"),
  plan: planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Users (perfil local sincronizado desde Clerk) ──────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Divisions ───────────────────────────────────────────────────────────────
// Nivel más alto de la jerarquía organizacional. División → Departamento → Puesto

export const divisions = pgTable(
  "divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Subtítulo libre que aparece debajo del título de la división. Si null,
    // no se renderiza nada. Antes tenía default "DIVISIÓN" pero era un valor
    // de UI mezclado con DB — ahora se deja al usuario configurarlo.
    subtitle: text("subtitle"),
    footerText: text("footer_text"),
    showFooter: boolean("show_footer").notNull().default(false),
    couplingGroup: text("coupling_group"),
    seniorEmployeeId: uuid("senior_employee_id"),
    isConnectable: boolean("is_connectable").notNull().default(true), // ids of divisions that are visually coupled (same group share size)
    color: text("color").default("#3D7EFF"),
    positionX: doublePrecision("position_x").default(0),
    positionY: doublePrecision("position_y").default(0),
    sizeWidth: doublePrecision("size_width").default(720),
    sizeHeight: doublePrecision("size_height").default(500),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("divisions_org_idx").on(table.organizationId),
  }),
);

// ─── Departments ─────────────────────────────────────────────────────────────
// organizationId guarda el Clerk org ID directamente (text) — sin FK a organizations

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    divisionId: uuid("division_id").references(() => divisions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // @deprecated — pensado para sub-departamentos jerárquicos, nunca se implementó.
    // No borrar todavía sin migración SQL (la columna existe en producción).
    parentId: uuid("parent_id"),
    color: text("color").default("#C8902C"),
    positionX: doublePrecision("position_x").default(0),
    positionY: doublePrecision("position_y").default(0),
    sizeWidth: doublePrecision("size_width").default(360),
    sizeHeight: doublePrecision("size_height").default(240),
    headEmployeeId: uuid("head_employee_id"),
    // Si true (default), el head del depto se renderiza promovido arriba del depto
    // como tarjeta independiente. Si false, queda adentro como un puesto más.
    promoteHead: boolean("promote_head").notNull().default(true),
    // Modo de layout interno: "vertical" (stack vertical con indent por nivel),
    // "compact" (cards 50% altura, sin indent), "manual" (respeta drag manual).
    layoutMode: text("layout_mode").notNull().default("vertical"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("departments_org_idx").on(table.organizationId),
  }),
);

// ─── Units ───────────────────────────────────────────────────────────────────
// Sub-grupos dentro de un departamento. Un encargado (manager) suele liderar una
// unidad; los miembros se asignan a ella. Es opcional — un departamento puede
// funcionar sin unidades, todos los empleados directos del director.

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    headEmployeeId: uuid("head_employee_id"), // el encargado que lidera la unidad
    positionX: doublePrecision("position_x").default(0),
    positionY: doublePrecision("position_y").default(0),
    sizeWidth: doublePrecision("size_width").default(260),
    sizeHeight: doublePrecision("size_height").default(160),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("units_org_idx").on(table.organizationId),
    deptIdx: index("units_dept_idx").on(table.departmentId),
  }),
);

// ─── Employees (nodos del org chart) ────────────────────────────────────────

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null",
    }), // solo para secretarios de división (sin departamento)
    fullName: text("full_name").notNull(),
    jobTitle: text("job_title"),
    description: text("description"),
    sectionName: text("section_name"), // sección dentro de un departamento (ej: "Norte", "Marketing digital")
    email: text("email"),
    phone: text("phone"),
    salary: text("salary"),
    managerId: uuid("manager_id"),
    // Rol del puesto: "director" | "manager" | "member" | null (auto).
    // Si null, se calcula automáticamente desde la estructura jerárquica
    // (función getEffectiveRole en src/components/dashboard/orgchart/roles.ts).
    // Si está seteado, override manual del usuario.
    role: text("role"),
    // Unidad a la que pertenece este puesto (sub-grupo dentro del depto).
    // Null = no asignado a ninguna unidad (cuelga directo del director).
    unitId: uuid("unit_id"),
    status: employeeStatusEnum("status").notNull().default("active"),
    color: text("color").default("#1A1814"),
    positionX: doublePrecision("position_x").default(0),
    positionY: doublePrecision("position_y").default(0),
    // Si true, respeta positionX/Y. Si false, layout jerárquico auto (DIR→ENC→team)
    // del motor `deptInternalLayout` toma control. Drag manual setea true.
    manualPosition: boolean("manual_position").notNull().default(false),
    startDate: timestamp("start_date", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("employees_org_idx").on(table.organizationId),
  }),
);

// ─── Projects + Tasks ───────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    orderIndex: doublePrecision("order_index").default(0),
    sectionName: text("section_name").default("Sin sección"),
    assigneeName: text("assignee_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("tasks_project_idx").on(table.projectId),
    orgIdx: index("tasks_org_idx").on(table.organizationId),
  }),
);

// ─── Project Members ─────────────────────────────────────────────────────────

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    role: projectMemberRoleEnum("role").notNull().default("member"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("project_members_project_idx").on(table.projectId),
    orgIdx: index("project_members_org_idx").on(table.organizationId),
  }),
);

// ─── Project Milestones ──────────────────────────────────────────────────────

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    status: milestoneStatusEnum("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("project_milestones_project_idx").on(table.projectId),
  }),
);

// ─── Documents (block editor / file storage) ─────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").notNull().default({}),
  parentId: uuid("parent_id"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdByEmployeeId: uuid("created_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Project Files (link proyecto ↔ documentos) ──────────────────────────────

export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    addedBy: text("added_by").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("project_files_project_idx").on(table.projectId),
  }),
);

// ─── Document Access (permisos granulares de documentos) ─────────────────────

export const documentAccess = pgTable(
  "document_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    granteeType: documentGranteeTypeEnum("grantee_type").notNull(),
    granteeId: text("grantee_id").notNull(),
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    revokedBy: text("revoked_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    documentIdx: index("document_access_doc_idx").on(table.documentId),
    granteeIdx: index("document_access_grantee_idx").on(table.granteeType, table.granteeId),
  }),
);

// ─── Orgchart state (edges persistidos) ─────────────────────────────────────

export const orgchartStates = pgTable("orgchart_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().unique(),
  edges: jsonb("edges").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Procesos ────────────────────────────────────────────────────────────────

export const processStatusEnum = pgEnum("process_status", ["draft", "active", "archived"]);
export const instanceStatusEnum = pgEnum("instance_status", ["running", "paused", "completed", "failed", "cancelled"]);
export const inboxTaskStatusEnum = pgEnum("inbox_task_status", ["pending", "claimed", "completed", "skipped", "cancelled"]);
export const inboxTaskPriorityEnum = pgEnum("inbox_task_priority", ["low", "medium", "high", "critical"]);

export const processDefinitions = pgTable(
  "process_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: processStatusEnum("status").notNull().default("draft"),
    category: text("category").notNull().default("general"),
    parentId: uuid("parent_id"), // para carpetas de procesos
    nodes: jsonb("nodes").notNull().default([]),
    edges: jsonb("edges").notNull().default([]),
    version: integer("version").notNull().default(1),
    environment: text("environment").notNull().default("production"), // "test" | "production"
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index("proc_def_org_idx").on(t.organizationId) })
);

export const processInstances = pgTable(
  "process_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    processDefinitionId: uuid("process_definition_id")
      .notNull()
      .references(() => processDefinitions.id),
    processName: text("process_name").notNull(),
    status: instanceStatusEnum("status").notNull().default("running"),
    currentNodeId: text("current_node_id").notNull(),
    startedBy: text("started_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    context: jsonb("context").notNull().default({}),
    history: jsonb("history").notNull().default([]),
  },
  (t) => ({
    orgIdx: index("proc_inst_org_idx").on(t.organizationId),
    defIdx: index("proc_inst_def_idx").on(t.processDefinitionId),
    statusIdx: index("proc_inst_status_idx").on(t.status),
  })
);

export const inboxTasks = pgTable(
  "inbox_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => processInstances.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeLabel: text("node_label").notNull(),
    processName: text("process_name").notNull(),
    assignedToDeptId: uuid("assigned_to_dept_id"),
    assignedToUserId: text("assigned_to_user_id"),
    claimedBy: text("claimed_by"),
    priority: inboxTaskPriorityEnum("priority").notNull().default("medium"),
    status: inboxTaskStatusEnum("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    formData: jsonb("form_data").notNull().default({}), // datos guardados del form runner
    context: jsonb("context").notNull().default({}),
    comments: jsonb("comments").notNull().default([]),
    allowTracking: boolean("allow_tracking").notNull().default(false), // si la etapa anterior puede hacer seguimiento
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("inbox_org_idx").on(t.organizationId),
    instanceIdx: index("inbox_instance_idx").on(t.instanceId),
    statusIdx: index("inbox_status_idx").on(t.status),
    deptIdx: index("inbox_dept_idx").on(t.assignedToDeptId),
  })
);

// ─── Permission Groups ────────────────────────────────────────────────────────

export const permissionGroups = pgTable(
  "permission_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    modules: jsonb("modules").notNull().default({}), // { employees: {view,create,edit,delete}, ... }
    isPreset: boolean("is_preset").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("permission_groups_org_idx").on(table.organizationId),
  }),
);

// ─── Permission Assignments ───────────────────────────────────────────────────

export const permissionAssignments = pgTable(
  "permission_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    subjectType: permissionSubjectTypeEnum("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => permissionGroups.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("permission_assignments_org_idx").on(table.organizationId),
    subjectIdx: index("permission_assignments_subject_idx").on(
      table.subjectType,
      table.subjectId
    ),
  }),
);

// ─── Tipos derivados ─────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Division = typeof divisions.$inferSelect;
export type NewDivision = typeof divisions.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type NewProjectMilestone = typeof projectMilestones.$inferInsert;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentAccess = typeof documentAccess.$inferSelect;
export type OrgchartState = typeof orgchartStates.$inferSelect;
export type ProcessDefinition = typeof processDefinitions.$inferSelect;
export type NewProcessDefinition = typeof processDefinitions.$inferInsert;
export type ProcessInstance = typeof processInstances.$inferSelect;
export type InboxTask = typeof inboxTasks.$inferSelect;
export type PermissionGroup = typeof permissionGroups.$inferSelect;
export type NewPermissionGroup = typeof permissionGroups.$inferInsert;
export type PermissionAssignment = typeof permissionAssignments.$inferSelect;
