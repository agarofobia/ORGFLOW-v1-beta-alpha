// GET /api/ai/config   — devuelve { configured, enabled, model, provider, preview }
//                         SIN exponer la API key real. Solo el preview.
// PUT /api/ai/config    — configurar/actualizar (requiere ai.manage).
//                         Acepta { apiKey?, enabled?, model? }.
// DELETE /api/ai/config — borra la config completa (revoke).

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { aiConfig, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { encrypt, previewSecret, decrypt } from "@/lib/encryption";

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
      return NextResponse.json({ configured: false, enabled: false, model: "claude-sonnet-4-6", provider: "anthropic", preview: null });
    }
    let preview: string | null = null;
    if (cfg.encryptedApiKey) {
      try {
        const plain = decrypt(cfg.encryptedApiKey);
        preview = previewSecret(plain);
      } catch {
        // Si falla decrypt, mostramos un preview de error pero no rompemos el GET.
        preview = "•••• (key inválida)";
      }
    }
    return NextResponse.json({
      configured: !!cfg.encryptedApiKey,
      enabled: cfg.enabled,
      model: cfg.model,
      provider: cfg.provider,
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
    if (typeof body.apiKey === "string" && body.apiKey.trim().length > 0) {
      // Validación mínima: keys de Anthropic empiezan con "sk-ant-"
      if (!body.apiKey.trim().startsWith("sk-ant-")) {
        return NextResponse.json(
          { error: "La API key debe empezar con 'sk-ant-' (Anthropic). Por ahora solo soportamos Claude." },
          { status: 400 }
        );
      }
      updates.encryptedApiKey = encrypt(body.apiKey.trim());
    }
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (typeof body.model === "string" && body.model.trim()) updates.model = body.model.trim();

    const internalUserId = await getInternalUserId(clerkUserId);

    // Upsert por organizationId
    const existing = (await db.select().from(aiConfig).where(eq(aiConfig.organizationId, orgId)).limit(1))[0];
    if (existing) {
      const [updated] = await db.update(aiConfig).set(updates).where(eq(aiConfig.id, existing.id)).returning();
      return NextResponse.json({ ok: true, id: updated.id });
    } else {
      const [created] = await db
        .insert(aiConfig)
        .values({
          organizationId: orgId,
          provider: "anthropic",
          encryptedApiKey: (updates.encryptedApiKey as string | undefined) ?? null,
          model: (updates.model as string | undefined) ?? "claude-sonnet-4-6",
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
