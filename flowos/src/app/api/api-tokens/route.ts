// GET  /api/api-tokens   — list tokens de la org (sin exponer hash)
// POST /api/api-tokens   — crear nuevo token (one-time reveal del valor)
//
// Permission: settings.manage (admin de la org).

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/require-permission";
import { generateApiToken } from "@/lib/api-token-auth";

export async function GET() {
  const block = await requirePermission("settings", "view");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scope: apiTokens.scope,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        revoked: apiTokens.revoked,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.organizationId, orgId))
      .orderBy(desc(apiTokens.createdAt));
    return NextResponse.json({ tokens: rows });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name requerido" }, { status: 400 });
    }
    const scope = ["read", "write", "admin"].includes(body.scope) ? body.scope : "read";

    const { token, prefix, hash } = generateApiToken();

    const u = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];

    const [created] = await db
      .insert(apiTokens)
      .values({
        organizationId: orgId,
        name: body.name.trim(),
        prefix,
        tokenHash: hash,
        scope,
        createdByUserId: u?.id ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning();

    // El token se devuelve UNA SOLA VEZ. Después solo prefix.
    return NextResponse.json(
      {
        token, // SOLO ACÁ se ve el token completo
        record: {
          id: created.id,
          name: created.name,
          prefix: created.prefix,
          scope: created.scope,
          createdAt: created.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return apiError(err);
  }
}
