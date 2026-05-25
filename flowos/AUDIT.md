# FlowOS — Auditoría de Código

*Snapshot: 2026-05-24. Lista de findings detectados en audit completo del codebase.*

---

## 📊 Stats generales

| Métrica | Valor |
|---|---|
| Archivos TS/TSX | 148 |
| Archivos CSS | 1 (`globals.css`, 938 líneas) |
| Componentes | 22 |
| Helpers en `lib/` | 16 |
| Hooks | 2 |
| API endpoints | 78 |

---

## 🚨 Findings críticos

### 1. Archivos demasiado grandes (refactor pendiente)
| Archivo | Líneas | Recomendación |
|---|---|---|
| `app/dashboard/projects/page.tsx` | **4181** | Dividir en sub-componentes: `ProjectModal`, `TasksView`, `MilestonesView`, etc. ya están definidos en el mismo archivo. Mover a archivos separados. |
| `components/dashboard/orgchart-canvas.tsx` | **2476** | Extraer hooks (useOrgchartLayout, useNodeBuilders, useContextMenu) y modales auxiliares. |
| `app/dashboard/processes/[id]/page.tsx` | **1333** | Separar `DesignerFlow`, paneles de propiedades y modales. |
| `app/dashboard/employees/page.tsx` | **1077** | Extraer `EmployeePanel`, `EmployeeCard`, `EmployeeFilters`. |
| `app/dashboard/docs/page.tsx` | **970** | Extraer `TreeNode`, `FilePreview`, `FolderPanel`. |

**Impacto**: lentitud de IDE en navigation, riesgo de bugs por scope amplio, dificultad para code review.

### 2. Dead code en `projects/page.tsx`

3 componentes definidos pero **nunca usados**:

- **`BoardView`** (línea ~3527) — versión vieja del kanban, reemplazada por `TimelineBoardView`. **Borrar.**
- **`SummaryView`** (línea ~1376) — versión vieja del tab Resumen. **Verificar y borrar si no se usa.**
- **`viewMode/setViewMode` useState** (línea ~578) — toggle que ya no se renderiza. **Borrar.**

### 3. Variables locales no usadas
- `orgchart-canvas.tsx:754` — `bW` variable declarada y nunca leída.
- `orgchart-canvas.tsx:917` — `dpLayoutMode` declarada y nunca usada.
- `projects/page.tsx:3308` — `createTask` prop de algún componente, no se usa.

### 4. Columnas legacy en DB
- ✅ `departments.parent_id` — **ya borrado** (24/05).
- 🟡 `tasks.sectionName` — la data se migró a `milestoneId`, pero el código frontend aún la usa en **60 referencias** (29 en `projects/page.tsx`). Migración data-side completa, UI-side incompleta.
- 🟡 `tasks.assigneeName` — similar, reemplazado por `assigneeEmployeeId` pero hay código legacy.

---

## ⚠️ Findings de seguridad

### Endpoints con auth solo `[CLERK]` (sin permission gating)

Cualquier miembro de la org puede acceder a estos endpoints mutativos:

| Endpoint | Método | Riesgo |
|---|---|---|
| `/api/employees` | POST | Cualquier miembro puede crear empleados |
| `/api/employees/[id]` | PUT, DELETE | Editar/borrar empleados |
| `/api/employees/[id]/vacate` | PUT | Vaciar puesto |
| `/api/divisions` | POST | Crear divisiones |
| `/api/divisions/[id]` | PUT, DELETE | Editar/borrar divisiones |
| `/api/departments` | POST, PUT, DELETE | Editar estructura de deptos |
| `/api/units` | POST, PUT, DELETE | Editar unidades |
| `/api/documents` | POST, PUT, DELETE | Crear/editar docs |
| `/api/projects` | POST, PUT, DELETE | Crear/editar proyectos |
| `/api/tasks` | POST, PUT, DELETE | Crear/editar tareas |
| `/api/attachments/[id]` | DELETE | Borrar adjuntos |

**Recomendación**: agregar `await requirePermission(module, action)` al inicio de cada endpoint mutativo. El helper ya existe en `src/lib/require-permission.ts`. ~30 minutos de trabajo.

### Endpoints bien protegidos (referencia)
- 🟢 `/api/ai/chat` — requiere `ai.create`
- 🟢 `/api/ai/config` PUT/DELETE — requiere `ai.manage`
- 🟢 `/api/api-tokens` POST/DELETE — requiere `settings.manage`
- 🟢 `/api/employees/bulk` — requiere `employees.edit`
- 🟢 `/api/permission-groups/*` mutativos — requiere `settings.manage`
- 🟢 `/api/webhook-subscriptions` mutativos — requiere `settings.manage`
- 🟢 `/api/v1/*` y `/api/mcp` — requiere API token con scope correcto

---

## 🟡 Findings de calidad

### Patrón anti: imports no usados
**15+ archivos** tenían imports declarados pero nunca usados (Loader2, Save, Trash2, ChevronDown, etc.). **Fixeados en este audit** vía cleanup manual de los más obvios. Quedan algunos por revisar manualmente.

### console.log restantes
3 ocurrencias en `api/webhooks/clerk/route.ts` — son logs de eventos del webhook, válidos para debugging en Vercel logs. No es dead code.

### Tablas vacías
- `organizations` — el webhook de Clerk no está syncing orgs. **No bloquea** porque el código usa `auth().orgId` directo (Clerk org_id como text). Anotado en current_state.
- `users` — similar. Se crea on-demand cuando un user interactúa.

---

## 📐 Arquitectura — estado actual

### Capas
```
src/
├── app/              Next.js App Router (105 archivos)
│   ├── api/          78 endpoints REST + 6 v1 + 1 MCP + 2 webhooks
│   └── dashboard/    11 páginas + layout + componentes inline
├── components/       22 archivos
│   ├── dashboard/    sidebar, topbar, AI widget, onboarding, orgchart, processes
│   └── ui/           command-palette, toast, popover, confirm-dialog, error-boundary
├── db/               schema.ts (802 líneas), index.ts
├── hooks/            useEmployees, usePermissions
├── lib/              16 helpers (bpm, permissions, webhooks, AI, encryption, etc.)
└── styles/           globals.css (938 líneas, sistema completo de tema)
```

### Stack
- **Next.js 15** App Router con Server Components
- **Drizzle ORM** + Supabase Postgres
- **Clerk** para auth y organizations
- **Stripe** para billing
- **Resend** para email
- **Vercel AI SDK** + 4 providers (Anthropic, Google, OpenAI, Mistral)
- **ReactFlow** para orgchart y BPM editor
- **DnD Kit** para drag & drop de tareas
- **react-markdown** + remark-gfm para chat AI
- **Recharts** para dashboard

### Sistemas correlacionales
1. **Orgchart** (divisiones → deptos → empleados → unidades) — columna vertebral
2. **Proyectos** (con VFP + hitos + tareas) — owner por `ownerEmployeeId` (puesto), no por user
3. **BPM** (process_definitions + instances + inboxTasks) — loop bidireccional con proyectos
4. **Audit trail** (process_events) — cycle time, throughput, bottleneck detection
5. **Permisos** (groups + assignments) — asignables a user/employee/depto/división
6. **AI** (multi-provider BYOK, 15+ tools) — hereda permisos del user
7. **Integraciones** (webhooks salientes + API tokens + MCP server) — bidireccional

---

## ✅ Lo que funciona bien

- Sistema de **CSS variables** completo (theme switch + accent dinámico al 100%)
- **Permisos modulares** bien diseñados
- **Audit trail BPM** comparable a Camunda/Bizagi (cycle time, percentiles)
- **AI multi-provider** con BYOK — Gemini Flash gratis para pilotos
- **Webhooks salientes** + **API tokens** + **MCP server** = integración con cualquier ecosistema
- **TypeScript strict** — `tsc --noEmit` pasa limpio
- **Mobile-aware** — safe-area-inset, touch-friendly, viewport-fit=cover

---

## 📋 Próximos pasos sugeridos

### Prioridad alta
1. **Refactor `projects/page.tsx`** en sub-componentes (4181 → idealmente ~500 c/u)
2. **Permission gating** en endpoints mutativos sin protección
3. **Borrar dead code**: `BoardView`, `SummaryView` viejos

### Prioridad media
4. **Limpiar UI legacy `sectionName`/`assigneeName`** en projects/page.tsx
5. **Refactor `orgchart-canvas.tsx`** en hooks separados
6. **Auto-deploy Vercel** — reconectar webhook GitHub

### Prioridad baja
7. **Documentar APIs** con OpenAPI/Swagger
8. **Tests** — hoy 0 tests automatizados
9. **Storybook** para componentes UI
10. **i18n** completo (hoy hardcodeado en español)

---

*Generado automáticamente durante auditoría 2026-05-24*
