# Pasos post-deploy

Una vez que la app esté deployada en `https://orgflow-frontend-x78r.vercel.app`, faltan estas 3 cosas para que todo funcione end-to-end:

---

## 1️⃣ Webhook de Clerk

Permite que Clerk avise a la app cuando se crean usuarios u organizaciones (para sincronizar a la DB).

1. Andá a https://dashboard.clerk.com → tu app FlowOS → **Webhooks**
2. Click **Add Endpoint**
3. **Endpoint URL:**
   ```
   https://orgflow-frontend-x78r.vercel.app/api/webhooks/clerk
   ```
4. **Subscribe to events:** marcá `user.created`, `organization.created`, `organization.deleted`
5. Click **Create**
6. En el endpoint creado, click **Signing Secret** y copialo (empieza con `whsec_`)
7. En Vercel → Project Settings → Environment Variables, agregá:
   ```
   CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxx
   ```
8. Redeploy

---

## 2️⃣ Webhook de Stripe

Permite que Stripe avise cuando alguien paga / cancela / actualiza suscripción.

1. Andá a https://dashboard.stripe.com → **Developers → Webhooks** → **Add endpoint**
2. **Endpoint URL:**
   ```
   https://orgflow-frontend-x78r.vercel.app/api/webhooks/stripe
   ```
3. **Events to send:** seleccioná:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. En el endpoint, click **Reveal** en "Signing secret" → copialo (empieza con `whsec_`)
6. En Vercel → Project Settings → Environment Variables:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxx
   ```
7. Redeploy

---

## 3️⃣ Inicializar la DB en Supabase

Las tablas todavía no existen. Hay 2 formas:

**A) Desde tu máquina local:**
```bash
cd flowos
npm install
npm run db:push
```

Esto agarra el `schema.ts` y crea todas las tablas en Supabase. El `DATABASE_URL` lo lee del `.env.local`.

**B) Desde la consola SQL de Supabase:**
1. Andá a tu proyecto en supabase.com → **SQL Editor**
2. Generá la migración con `npm run db:generate` localmente
3. Pegá el SQL generado en `src/db/migrations/0000_xxx.sql` y ejecutalo

Recomiendo (A) — es más rápido.

---

## ✅ Test final

1. Andá a `https://orgflow-frontend-x78r.vercel.app`
2. Click "Empezar"
3. Crea cuenta con tu email
4. Te lleva a Onboarding → crea una org "Test"
5. Te deja en el dashboard
6. Andá a `/dashboard/orgchart` → tendría que mostrar el canvas con 4 nodos de demo
7. Andá a `/dashboard/billing` → pagar con tarjeta de testing Stripe `4242 4242 4242 4242` cualquier fecha futura, CVC `123`
8. Después del pago, la org pasa a Plan Pro automáticamente (si el webhook de Stripe está bien configurado)

---

## 🔄 Rotar las claves expuestas

Como pegaste las API keys en el chat público, **antes de ir a producción real** rotalas:

- Clerk: dashboard.clerk.com → API Keys → ⋮ → **Rotate**
- Stripe: dashboard.stripe.com → Developers → API Keys → **Roll secret key**
- Supabase: cambiá la password en Settings → Database

Después actualizá las env vars en Vercel con las nuevas. Los `pk_test_` / `sk_test_` no son críticos (son de testing), pero igual es buena práctica.
