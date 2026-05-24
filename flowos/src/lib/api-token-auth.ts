// API Token Authentication
// =========================
// Helper para autenticar requests a /api/v1/* usando Bearer tokens en
// vez de Clerk session cookies.
//
// Flujo:
//   1. Cliente externo manda Authorization: Bearer flo_<32-hex>
//   2. Server hashea el token con sha256 y lo busca en api_tokens
//   3. Si existe + no revoked + no expired → devuelve { orgId, scope }
//   4. Update last_used_at en background

import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export type ApiScope = "read" | "write" | "admin";

export interface ApiTokenContext {
  tokenId: string;
  organizationId: string;
  scope: ApiScope;
}

// ─── Generación + hashing ────────────────────────────────────────────────────

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("hex"); // 48 chars
  const token = `flo_${raw}`;
  const prefix = `${token.slice(0, 12)}…`; // ej "flo_a1b2c3d4…"
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, prefix, hash };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

/**
 * Autentica un request usando el header Authorization: Bearer flo_...
 * Devuelve null si el header falta o el token es inválido.
 * Si el token es válido, devuelve el contexto + dispara update de last_used_at.
 */
export async function authenticateApiToken(req: NextRequest): Promise<ApiTokenContext | null> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token.startsWith("flo_") || token.length < 16) return null;

  const hash = hashApiToken(token);
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash), eq(apiTokens.revoked, false)))
    .limit(1);

  const tk = rows[0];
  if (!tk) return null;
  if (tk.expiresAt && tk.expiresAt < new Date()) return null;

  // Update last_used_at (fire-and-forget, no esperamos)
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, tk.id))
    .then(() => {})
    .catch(() => {});

  return {
    tokenId: tk.id,
    organizationId: tk.organizationId,
    scope: tk.scope as ApiScope,
  };
}

/**
 * Helper para usar en route handlers. Devuelve el contexto o un NextResponse
 * de error 401.
 */
export async function requireApiToken(
  req: NextRequest,
  requiredScope: ApiScope = "read"
): Promise<{ ctx: ApiTokenContext } | { response: NextResponse }> {
  const ctx = await authenticateApiToken(req);
  if (!ctx) {
    return {
      response: NextResponse.json(
        {
          error: "Unauthorized",
          hint: "Pass Authorization: Bearer flo_... header. Get tokens at /dashboard/settings → API Tokens.",
        },
        { status: 401 }
      ),
    };
  }
  if (!hasScope(ctx.scope, requiredScope)) {
    return {
      response: NextResponse.json(
        { error: `Forbidden: requires '${requiredScope}' scope (token has '${ctx.scope}')` },
        { status: 403 }
      ),
    };
  }
  return { ctx };
}

/**
 * Scope hierarchy: admin > write > read.
 */
export function hasScope(tokenScope: ApiScope, requiredScope: ApiScope): boolean {
  const levels: Record<ApiScope, number> = { read: 0, write: 1, admin: 2 };
  return levels[tokenScope] >= levels[requiredScope];
}
