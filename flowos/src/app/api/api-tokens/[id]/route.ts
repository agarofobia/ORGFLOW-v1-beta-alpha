// DELETE /api/api-tokens/:id — revocar (NO borra, marca revoked=true)

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await db
      .update(apiTokens)
      .set({ revoked: true })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
