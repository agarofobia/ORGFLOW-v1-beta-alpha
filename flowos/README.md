# FlowOS

> El sistema operativo de tu empresa. Org chart, procesos BPM, proyectos, wiki y billing en una sola herramienta.

Construido con **Next.js 15**, **Clerk** (auth + organizations), **Stripe** (suscripciones), **Drizzle + Supabase Postgres** (DB) y **React Flow** (org chart + diseñador BPM).

**Producción:** https://flow-os-ruddy.vercel.app

---

## 🚀 Setup local

```bash
npm install
# .env.local ya está configurado en el repo
npm run dev
```

App en `http://localhost:3000`.

## 📦 Scripts

| Comando | Hace |
|---|---|
| `npm run dev` | Levanta dev server con hot reload |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run db:generate` | Genera migraciones de Drizzle desde schema.ts |
| `npm run db:push` | Aplica el schema directo a la DB (**correr en terminal VSCode, no desde scripts**) |

---

## 🔑 Variables de entorno

### Clerk
1. Crear app en [dashboard.clerk.com](https://dashboard.clerk.com)
2. **Activar Organizations** en Configure → Organizations → ON
3. **Copiar claves** desde API Keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. **Configurar webhook** apuntando a `https://tu-dominio/api/webhooks/clerk`
   - Eventos: `user.created`, `organization.created`, `organization.deleted`
   - Copiar el signing secret a `CLERK_WEBHOOK_SECRET`

### Stripe
1. **Productos ya creados** en tu cuenta (vía MCP):
   - FlowOS Pro: `prod_UQ3Z39vWZoMfVt`
   - FlowOS Enterprise: `prod_UQ3Z0IfuVZVTYa`
2. **Copiar claves** desde [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys
3. **Configurar webhook** apuntando a `https://tu-dominio/api/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. **Activar Customer Portal** en Settings → Customer Portal

### Supabase
1. Crear proyecto en [supabase.com](https://supabase.com)
2. Settings → Database → Connection string → mode `transaction` (puerto 6543)
3. `npm run db:push` para crear las tablas

---

## 🧪 Cómo testear la app

### Prerequisitos

1. `npm run dev` corriendo
2. Tener una organización creada en Clerk (el dashboard la requiere)
3. Schema aplicado en DB — correr `npm run db:push` desde la terminal de VSCode si es la primera vez

### Flujo paso a paso

#### Auth
- Ir a `http://localhost:3000` → sign in / sign up
- Crear una organización cuando Clerk lo solicite (o ir a `/select-org`)
- Redirige al dashboard automáticamente

#### Org Chart → `/dashboard/orgchart`
- Click **"Sumar empleado"** → ingresar nombre y puesto
- El nodo aparece en el canvas — arrastrarlo para reposicionar (se guarda automáticamente)
- Conectar nodos arrastrando desde los puntos de los bordes (handles)
- **Si aparece el cartel de error:** la DB no está alcanzable o la migración no fue corrida → `npm run db:push`

#### Procesos BPM → `/dashboard/processes`
- Click **"Nuevo proceso"** → abre el diseñador
- En el panel izquierdo, click en cualquier elemento (Inicio, Fin, Tarea humana, etc.) para agregarlo al canvas
- Conectar nodos arrastrando desde los handles
- Seleccionar un nodo para editar propiedades en el panel derecho
- Click **"Guardar"** (arriba a la derecha)
- Cambiar el estado a **"Activo"** con el dropdown de estado (arriba izquierda)
- Click **"Iniciar instancia"** para lanzar una ejecución del proceso

#### Bandeja → `/dashboard/inbox`
- Muestra las tareas generadas por instancias de proceso activas
- **"Tomar"** → asigna la tarea al usuario actual (status: claimed)
- **"Completar"** → marca como completa y avanza el proceso al siguiente nodo
- Filtrar por: Pendientes / En progreso / Completadas

#### Diseñador BPM — tipos de nodos

| Icono | Tipo | Color | Descripción |
|-------|------|-------|-------------|
| ● | `startEvent` | Verde | Inicio del proceso |
| ⊙ | `endEvent` | Rojo | Fin del proceso |
| 👤 | `userTask` | Azul | Tarea para humano/departamento |
| ⚙️ | `serviceTask` | Naranja | Acción de servicio (email, API) |
| ⚡ | `automatedTask` | Violeta | Tarea automática del sistema |
| ◇+ | `parallelGateway` | Amarillo | Bifurca en ramas paralelas |
| ◇× | `exclusiveGateway` | Rojo | Toma un camino según condición |

#### Problemas frecuentes

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Org chart vacío / error | Schema no aplicado | `npm run db:push` en terminal VSCode |
| Botón "Nuevo proceso" no hace nada y aparece alert de error | Ver el mensaje del alert | Generalmente DB o auth |
| En Vercel todo falla | Env vars no configuradas | Correr `vercel env ls` para verificar; ya están cargadas |
| `invalid input syntax for type uuid` en consola | Schema viejo con UUID FK en organizationId | Ya corregido en schema v2 (text) |

---

## 📐 Arquitectura

```
src/
├── app/                   # App Router de Next.js
│   ├── page.tsx           # Landing
│   ├── sign-in, sign-up   # Auth (Clerk)
│   ├── onboarding         # Crear primera org
│   ├── select-org         # Switcher cuando hay varias
│   ├── dashboard/         # App protegida
│   │   ├── page.tsx       # Home con stats
│   │   ├── orgchart/      # Canvas con React Flow
│   │   ├── employees/     # Lista de empleados
│   │   ├── projects/      # Proyectos + tareas Kanban
│   │   ├── docs/          # Editor de documentos
│   │   ├── processes/     # Diseñador BPM + lista
│   │   │   └── [id]/      # Designer por proceso
│   │   ├── inbox/         # Bandeja de tareas BPM
│   │   ├── team/          # Gestión de miembros
│   │   ├── billing/       # Stripe checkout + portal
│   │   └── settings/      # Tema, idioma, permisos
│   └── api/
│       ├── employees/     # CRUD empleados
│       ├── projects/      # CRUD proyectos
│       ├── tasks/         # CRUD tareas
│       ├── processes/     # CRUD + start proceso
│       ├── instances/     # advance instancia
│       ├── inbox/         # claim/complete/skip tareas
│       ├── billing/       # checkout + portal
│       └── webhooks/      # stripe + clerk
├── components/            # UI reutilizable
├── db/                    # Drizzle schema + cliente
├── hooks/                 # useEmployees, etc.
├── lib/                   # bpm engine, plans, stripe, utils
├── middleware.ts          # Clerk auth + redirects
└── styles/globals.css     # Design tokens
```

### Multi-tenant
- **Auth + orgs** delegados a Clerk (gratis hasta 100 orgs activas)
- Cada query a la DB filtra por `organizationId = orgId` del request
- Supabase RLS opcional para defense-in-depth

### Pagos
- Productos y prices creados en Stripe
- Checkout server-side en `/api/billing/create-checkout`
- Webhook actualiza `org.publicMetadata.plan` en Clerk
- UI lee `useOrganization().organization.publicMetadata.plan`

---

## 🌐 Deploy a Vercel

El proyecto está linkeado al proyecto `flowos` en `arturo-arragas-projects`.

```bash
# Deploy manual a producción
vercel --prod

# Ver env vars configuradas en Vercel
vercel env ls

# Sincronizar env vars de Vercel al .env.local
vercel env pull .env.local
```

### Env vars en Vercel (ya configuradas)

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | https://flow-os-ruddy.vercel.app |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys |
| `CLERK_SECRET_KEY` | Clerk → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (transaction mode) |

> Después de agregar/cambiar env vars, hacer redeploy: `vercel --prod`

---

## 🎨 Design

Estética editorial / arquitectónica:
- Display: **Instrument Serif** (Google Fonts)
- Body: **Inter Tight**
- Mono: **JetBrains Mono**
- Paleta: paper warm + ink negro cálido + ocre + rust + moss

No es generic-AI-SaaS. Tiene carácter.

---

## 🪪 Licencia

Propietario. © 2026 Insureline MutualAid.
