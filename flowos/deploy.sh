#!/usr/bin/env bash
# Deploy automático de FlowOS a Vercel.
# Uso:
#   ./deploy.sh                                     (login interactivo)
#   VERCEL_TOKEN=tu_token_aca ./deploy.sh           (sin login)

set -e
cd "$(dirname "$0")"

# ── 1. Pre-checks ─────────────────────────────────────────────────────
if [ ! -f ".env.local" ]; then
  echo "❌ Falta .env.local"
  echo "   Hacé:  cp .env.example .env.local"
  echo "   Y completalo con tus claves antes de seguir."
  exit 1
fi

# ── 2. Vercel CLI ─────────────────────────────────────────────────────
if ! command -v vercel >/dev/null 2>&1; then
  echo "📦 Instalando Vercel CLI globalmente..."
  npm install -g vercel
fi

# ── 3. Auth ───────────────────────────────────────────────────────────
TOKEN_ARG=""
if [ -n "$VERCEL_TOKEN" ]; then
  TOKEN_ARG="--token=$VERCEL_TOKEN"
  echo "🔐 Usando VERCEL_TOKEN del environment"
elif ! vercel whoami >/dev/null 2>&1; then
  echo "🔐 Login con tu cuenta de Vercel (te abre el browser)..."
  vercel login
fi

# ── 4. Link al proyecto ───────────────────────────────────────────────
echo ""
echo "🔗 Linkeando al proyecto orgflow-frontend-x78r..."
vercel link --yes --project orgflow-frontend-x78r $TOKEN_ARG

# ── 5. Subir env vars ─────────────────────────────────────────────────
echo ""
echo "📤 Subiendo variables de entorno a Vercel..."

while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | xargs)"
  [ -z "$key" ] && continue

  echo "  → $key"
  vercel env rm "$key" production -y $TOKEN_ARG >/dev/null 2>&1 || true
  vercel env rm "$key" preview -y $TOKEN_ARG >/dev/null 2>&1 || true
  vercel env rm "$key" development -y $TOKEN_ARG >/dev/null 2>&1 || true
  printf "%s" "$value" | vercel env add "$key" production $TOKEN_ARG >/dev/null 2>&1
  printf "%s" "$value" | vercel env add "$key" preview $TOKEN_ARG >/dev/null 2>&1
  printf "%s" "$value" | vercel env add "$key" development $TOKEN_ARG >/dev/null 2>&1
done < .env.local

# ── 6. Deploy ─────────────────────────────────────────────────────────
echo ""
echo "🚀 Deploy a producción (~2-3 min)..."
echo ""
vercel deploy --prod --yes $TOKEN_ARG

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅  Deploy listo"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "🌐 https://orgflow-frontend-x78r.vercel.app"
echo ""
echo "📋 Siguiente paso: leé POST-DEPLOY.md para webhooks Stripe/Clerk + db push"
