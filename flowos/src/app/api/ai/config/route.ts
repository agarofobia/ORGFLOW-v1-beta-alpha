// GET /api/ai/config   — devuelve { configured, enabled, provider, model, preview }
//                         SIN exponer la API key real. Solo el preview.
// PUT /api/ai/config    — configurar/actualizar (requiere ai.manage).
//                         Acepta { provider?, apiKey?, enabled?, model? }.
// DELETE /api/ai/config — borra la config completa (revoke).

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { aiConfig, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { encrypt, previewSecret, decrypt } from "@/lib/encryption";
import { isValidProvider, validateApiKey, getDefaultModelFor, type AiProvider } from "@/lib/ai/providers";

function getValidProvider(s: unknown): AiProvider | null {
  return typeof s === "string" && isValidProvider(s) ? s : null;
}

async function getInternalUserId(clerkUserId: string): Promise<string | null> {
  const u = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
  return u?.id ?? null;
}

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [cfg] = await db.select().from(aiConfig).where(eq(aiConfig.organizationId, orgId)).limit(1);
    if (!cfg) {
      return NextResponse.json({
        configured: false,
        enabled: false,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        preview: null,
      });
    }
    let preview: string | null = null;
    if (cfg.encryptedApiKey) {
      try {
        const plain = decrypt(cfg.encryptedApiKey);
        preview = previewSecret(plain);
      } catch {
        preview = "•••• (key inválida)";
      }
    }
    return NextResponse.json({
      configured: !!cfg.encryptedApiKey,
      enabled: cfg.enabled,
      provider: cfg.provider,
      model: cfg.model,
      preview,
      updatedAt: cfg.updatedAt,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const block = await requirePermission("ai", "manage");
  if (block) return block;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    // Provider: validamos que sea conocido
    let providerForKey: ReturnType<typeof getValidProvider> = null;
    if (typeof body.provider === "string") {
      if (!isValidProvider(body.provider)) {
        return NextResponse.json({ error: `Provider inválido: ${body.provider}` }, { status: 400 });
      }
      updates.provider = body.provider;
      providerForKey = body.provider;
    }

    // API key: validamos el formato según el provider que vaya a quedar
    if (typeof body.apiKey === "string" && body.apiKey.trim().length > 0) {
      // Determinamos el provider final (el del body o el existente en DB)
      const existing = (await db.select().from(aiConfig).where(eq(aiConfig.organizationId, orgId)).limit(1))[0];
      const finalProvider = providerForKey ?? existing?.provider ?? "anthropic";
      if (!isValidProvider(finalProvider)) {
        return NextResponse.json({ error: `Provider inválido en DB: ${finalProvider}` }, { status: 500 });
      }
      const validation = validateApiKey(finalProvider, body.apiKey);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.encryptedApiKey = encrypt(body.apiKey.trim());
    }

    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (typeof body.model === "string" && body.model.trim()) updates.model = body.model.trim();

    const internalUserId = await getInternalUserId(clerkUserId);

    const existing = (await db.select().from(aiConfig).where(eq(aiConfig.organizationId, orgId)).limit(1))[0];

    // Si cambia el provider y no se pasó modelo, defaulteamos al modelo del provider nuevo
    if (providerForKey && !updates.model) {
      updates.model = getDefaultModelFor(providerForKey);
    }

    if (existing) {
      const [updated] = await db.update(aiConfig).set(updates).where(eq(aiConfig.id, existing.id)).returning();
      return NextResponse.json({ ok: true, id: updated.id });
    } else {
      const finalProviderStr = (updates.provider as string | undefined) ?? "anthropic";
      const finalProvider = isValidProvider(finalProviderStr) ? finalProviderStr : "anthropic";
      const [created] = await db
        .insert(aiConfig)
        .values({
          organizationId: orgId,
          provider: finalProvider,
          encryptedApiKey: (updates.encryptedApiKey as string | undefined) ?? null,
          model: (updates.model as string | undefined) ?? getDefaultModelFor(finalProvider),
          enabled: (updates.enabled as boolean | undefined) ?? false,
          configuredByUserId: internalUserId,
        })
        .returning();
      return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  const block = await requirePermission("ai", "manage");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.delete(aiConfig).where(eq(aiConfig.organizationId, orgId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
