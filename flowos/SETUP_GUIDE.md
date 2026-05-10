# 🚀 OrgFlow - Deploy Guide

## 1. Variables de entorno (`.env.local`)

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/flowos"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Stripe
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 2. Setup local

```bash
cd flowos

# Instalar deps
npm install

# Preparar DB
npx drizzle-kit push:pg

# Dev server
npm run dev
```

Abre http://localhost:3000

## 3. Deploy (Vercel)

```bash
# Link a tu repo en GitHub
vercel link

# Agregar env vars en Vercel dashboard
# (copiar de .env.local)

# Deploy
vercel deploy --prod
```

## 4. Checklist final

- [ ] Base de datos PostgreSQL (Supabase, Neon, etc)
- [ ] Clerk app creada (https://dashboard.clerk.com)
- [ ] Stripe account (https://stripe.com)
- [ ] Webhooks configurados (Clerk → /api/webhooks/clerk, Stripe → /api/webhooks/stripe)
- [ ] Env vars en Vercel
- [ ] Domain custom (opcional)

## 5. Features listas para usar

### Dashboard
- ✅ Org chart infinito (arrastrable, connectable)
- ✅ Empleados tabla + CRUD
- ✅ Proyectos kanban (4 columnas)
- ✅ Docs editor de bloques
- ✅ Team (Clerk OrganizationProfile)
- ✅ Billing (Stripe checkout + portal)
- ✅ Settings

### Auth
- ✅ Sign-in / Sign-up (Clerk)
- ✅ Org switching
- ✅ User roles (Admin, Member)

## 6. Troubleshooting

**Error: `DATABASE_URL not found`**
→ Agregar en `.env.local`

**Error: `Unauthorized` en APIs**
→ Verificar Clerk keys en `.env.local`

**Error: `Cannot find module SWR`**
→ `npm install swr`

**Error: `drizzle-kit not found`**
→ `npm install -D drizzle-kit`

## Stack final

- **Frontend**: Next.js 14 + React 18 + Tailwind
- **Auth**: Clerk
- **DB**: PostgreSQL + Drizzle ORM
- **Payments**: Stripe
- **Graphs**: @xyflow/react (React Flow)
- **UI**: Lucide icons
- **Hosting**: Vercel (recomendado)

---

**Listo para producción ✅** 

Cualquier duda → revisar archivos en `src/app/api/` y `src/app/dashboard/`
