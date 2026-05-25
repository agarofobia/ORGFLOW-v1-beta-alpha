# FlowOS

> El sistema operativo correlacional de tu empresa. Organigrama vivo, procesos BPM, proyectos con VFP, asistente IA multi-provider, integraciones bidireccionales — en una sola herramienta.

**Producción:** https://flowos-delta.vercel.app

---

## ¿Qué es FlowOS?

FlowOS es una **suite BPM/ERP correlacional**. La diferencia con Asana / Notion / Monday: el organigrama no es decoración, es el **centro de gravedad** de todo lo demás. Cada proyecto, tarea, proceso BPM, document y permiso se ata a posiciones del orgchart — si la persona en un puesto cambia, lo que tenía asignado sigue ahí.

Construido para llenar el hueco entre los BPM enterprise (Camunda, Bizagi — caros y complejos) y los gestores de proyectos (Asana, Notion — sin BPM real).

---

## 🚀 Features principales

### Organigrama correlacional
- Divisiones → departamentos → unidades → puestos
- Puestos vacantes con dignidad (no "[V" feo)
- Drag & drop, layout automático con dagre
- Bulk operations (shift+click multi-select)
- Edges persistidos, color por entidad
- Touch-friendly en mobile (pinch zoom + drag)

### Proyectos con VFP
- **Valuable Final Product** obligatorio: definir qué es "estar terminado" antes de crear tareas
- Hitos con acceptance criteria + owner por employee
- Vistas: Lista, Tablero temporal (Hoy/Semana/Por venir), Hitos (timeline), Resumen
- Templates clonables con VFP + hitos + tareas pre-armados
- Comentarios + activity feed + adjuntos en tareas

### BPM con engine real
- Editor visual con startEvent, endEvent, userTask, serviceTask, gateways (exclusive/parallel)
- Instancias con history + context + bandeja de tareas
- **Loop bidireccional** con Proyectos: una instancia auto-crea un proyecto desde template
- **Audit trail** completo: process_events con cycle time, percentiles, bottleneck detection
- **Heatmap** sobre el diagrama (verde = rápido, rojo = cuello de botella)
- 5 templates BPM curados pre-instalados (Onboarding, Aprobación gastos, Vacaciones, Compras, Marketing)

### Asistente IA multi-provider
- **BYOK** (Bring Your Own Key): Claude, Gemini, OpenAI, Mistral — el user trae su API key
- **Gemini Flash tier gratuito** (1,500 req/día) para pilotos sin presupuesto
- 15+ tools que respetan permisos del user invocante:
  - Leer: orgchart, empleados, proyectos, hitos, tareas, procesos
  - Crear: proyectos (con VFP), hitos, tareas, procesos BPM, empleados, deptos, divisiones
  - **Nunca delete** — la IA no puede borrar nada
- API key encriptada con AES-256-GCM
- Chat flotante con markdown rendering + animaciones

### Permisos modulares
- 9 módulos × 5 acciones (view/create/edit/delete/manage)
- Grupos asignables a user / employee / department / division
- Presets: admin, manager, employee, readonly
- Merge automático de assignments múltiples

### Integraciones bidireccionales

**Salientes (FlowOS → app externa):**
- Webhooks con HMAC-SHA256 signing
- 15 tipos de evento (task, project, milestone, process)
- Historial de entregas con response codes

**Entrantes (app externa → FlowOS):**
- **API REST pública** `/api/v1/*` con API tokens (scope: read/write/admin)
- **MCP server** para Claude Desktop, Cursor, Windsurf, cualquier MCP client
- Compatible con Make, n8n, Zapier, scripts, IAs locales (Ollama)

### Otros
- Dashboard con widgets personalizables + sparklines reales (snapshots diarios)
- Búsqueda global Ctrl+K en proyectos/tareas/empleados/hitos/procesos/docs
- Email notifications via Resend
- Theme system completo (dark / light / accent dinámico)
- Onboarding wizard 4 pasos para orgs nuevas
- Mobile-aware con safe-area-inset

---

## 🛠 Stack

```
Frontend       Next.js 15 (App Router) + TypeScript + Tailwind
Auth           Clerk (multi-org)
DB             Supabase Postgres + Drizzle ORM
Storage        Supabase Storage (employee photos, files)
Billing        Stripe (subscriptions)
Email          Resend
AI             Vercel AI SDK + @ai-sdk/{anthropic,google,openai,mistral}
Canvas         @xyflow/react (ReactFlow) + dagre
DnD            @dnd-kit (tasks board)
Markdown       react-markdown + remark-gfm
Encryption     Node crypto (AES-256-GCM)
Deploy         Vercel
```

---

## 📁 Estructura

```
flowos/
├── src/
│   ├── app/                    Next.js App Router (105 archivos)
│   │   ├── api/                78 endpoints REST + v1 + MCP + webhooks
│   │   ├── dashboard/          11 páginas + layout
│   │   ├── sign-in/, sign-up/, onboarding/, select-org/
│   │   └── layout.tsx, page.tsx (landing)
│   ├── components/             22 archivos
│   │   ├── dashboard/          sidebar, topbar, AI widget, onboarding, orgchart/, processes/
│   │   ├── ui/                 command-palette, toast, popover, confirm-dialog, error-boundary
│   │   └── theme-bridge.tsx    aplica preferencia de tema al cargar
│   ├── db/
│   │   ├── schema.ts           Drizzle schema (~27 tablas)
│   │   └── index.ts            DB client
│   ├── hooks/                  useEmployees, usePermissions
│   ├── lib/                    bpm, permissions, webhooks, ai/, encryption, etc.
│   └── styles/
│       └── globals.css         sistema de CSS variables + utility classes
├── public/                     assets estáticos
├── drizzle/                    migraciones generadas
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vercel.json                 cron jobs (snapshot diario de métricas)
```

---

## 🚦 Setup local

### Requisitos
- Node.js 24.x
- npm

### Variables de entorno (`.env.local`)

```bash
# Supabase
DATABASE_URL=postgres://...
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Resend (opcional — email notifications)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=FlowOS <noreply@yourdomain.com>

# AI encryption (32 bytes hex)
AI_ENCRYPTION_KEY=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron (opcional — protege /api/cron/*)
CRON_SECRET=...
```

### Comandos

```bash
npm install
npm run dev               # http://localhost:3000
npm run build
npm run start
npm run lint
npx tsc --noEmit         # type check
npx drizzle-kit push     # apply schema changes
npx drizzle-kit studio   # GUI de la DB
```

---

## 🔌 API pública (v1)

Base URL: `https://flowos-delta.vercel.app/api/v1`

Auth: `Authorization: Bearer flo_<32-hex>` (generar token en Settings)

| Endpoint | Método | Scope |
|---|---|---|
| `/projects` | GET | read |
| `/projects` | POST | write |
| `/tasks` | GET, POST | read / write |
| `/employees` | GET, POST | read / write |
| `/orgchart` | GET | read |
| `/processes` | GET | read |
| `/processes/:id/start` | POST | write |

### MCP Server

Endpoint: `POST /api/mcp` (JSON-RPC 2.0)

Compatible con Claude Desktop, Cursor, Windsurf, etc.

Config example para Claude Desktop:
```json
{
  "mcpServers": {
    "flowos": {
      "url": "https://flowos-delta.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer flo_<tu-token>"
      }
    }
  }
}
```

---

## 🤖 Asistente IA — providers soportados

| Provider | Key prefix | Modelo recomendado | Tier free |
|---|---|---|---|
| **Google Gemini** | `AIza...` | `gemini-2.5-flash` | ✅ 1,500 req/día |
| Anthropic Claude | `sk-ant-...` | `claude-sonnet-4-6` | ❌ |
| OpenAI GPT | `sk-...` | `gpt-4o` | ❌ |
| Mistral | (custom) | `mistral-large-latest` | ❌ |

Setup en `/dashboard/settings → Asistente IA`. La key se guarda encriptada con AES-256-GCM.

---

## 📋 Webhooks

Settings → Integraciones → Webhooks → "Nuevo webhook".

Cada webhook entrega un POST con:
- `X-FlowOS-Event`: tipo de evento
- `X-FlowOS-Timestamp`: timestamp Unix
- `X-FlowOS-Signature`: `sha256=<hmac>` para verificación

### Eventos disponibles
```
task.created, task.assigned, task.completed, task.status_changed
project.created, project.completed, project.vfp_updated
milestone.created, milestone.completed
process.instance_started, process.instance_completed, process.instance_failed
process.task_created, process.task_completed
employee.created
```

### Verificación de signature (Node.js)
```js
const crypto = require('crypto');

function verifyFlowOSWebhook(secret, timestamp, body, signature) {
  const sig = signature.replace('sha256=', '');
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

---

## 🏗 Arquitectura conceptual

### El modelo correlacional

FlowOS está diseñado alrededor de **5 conceptos que se cruzan en todas las funciones**:

```
┌─────────────────────────────────────────────────────────────┐
│                       ORGANIGRAMA                            │
│  Divisiones · Departamentos · Unidades · Puestos (employees)│
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼─────────────────────┐
        ▼                  ▼                     ▼
┌─────────────┐    ┌──────────────┐    ┌────────────────┐
│  PROYECTOS  │    │  PROCESOS    │    │   PERMISOS     │
│             │◀──▶│   BPM        │    │                │
│ VFP + hitos │    │              │    │ groups +       │
│ + tareas    │    │ instances +  │    │ assignments    │
│             │    │ inbox tasks  │    │                │
└──────┬──────┘    └──────┬───────┘    └────────────────┘
       │                  │
       └────────┬─────────┘
                │
                ▼
       ┌────────────────┐
       │  AUDIT TRAIL   │
       │ process_events │
       │ cycle time,    │
       │ throughput     │
       └────────────────┘
```

### Decisiones de diseño clave

1. **Owner por puesto, no por persona** — Si Pedro reemplaza a María en su puesto, las tareas de María (asignadas via `assigneeEmployeeId`) pasan a Pedro automáticamente.

2. **VFP forzado** — No podés crear tareas en un proyecto sin definir primero el Valuable Final Product. Esto evita backlogs infinitos sin criterio de "terminado".

3. **Loop BPM ↔ Proyectos** — Un proceso puede tener un `projectTemplate` asociado. Al iniciar la instancia, se crea automáticamente un proyecto con VFP + hitos + tareas. Cuando un hito del proyecto se completa y tiene `bpmNodeId`, avanza el nodo del proceso. Loop cerrado.

4. **AI con permisos heredados** — El asistente IA no puede hacer nada que el user invocante no pueda. Tools se filtran ANTES de exponer al modelo.

---

## 📚 Documentación adicional

- [`AUDIT.md`](./AUDIT.md) — Auditoría de código (refactor pendientes, dead code, seguridad)
- Obsidian vault (privado) — notas de arquitectura, decisiones, sesiones

---

## 📝 Licencia

Propietario — Arturo Arraga, en desarrollo activo (2026).
