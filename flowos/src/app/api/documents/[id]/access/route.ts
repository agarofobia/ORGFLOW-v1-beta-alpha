import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { documentAccess } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

/** GET /api/documents/[id]/access — list active access grants */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(documentAccess)
      .where(
        and(
          eq(documentAccess.documentId, documentId),
          eq(documentAccess.organizationId, orgId),
          isNull(documentAccess.revokedAt)
        )
      );
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

/** POST /api/documents/[id]/access — grant access */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("documents", "manage");
  if (block) return block;

  try {
    const body = await req.json();
    const { granteeType, granteeId } = body;
    if (!granteeType || !granteeId) {
      return NextResponse.json({ error: "granteeType y granteeId son requeridos" }, { status: 400 });
    }

    // Check no active grant already exists
    const existing = await db
      .select({ id: documentAccess.id })
      .from(documentAccess)
      .where(
        and(
          eq(documentAccess.documentId, documentId),
          eq(documentAccess.organizationId, orgId),
          eq(documentAccess.granteeType, granteeType),
          eq(documentAccess.granteeId, granteeId),
          isNull(documentAccess.revokedAt)
        )
      )
      .limit(1);
    if (existing[0]) return NextResponse.json(existing[0]);

    const result = await db
      .insert(documentAccess)
      .values({
        documentId,
        organizationId: orgId,
        granteeType,
        granteeId,
        grantedBy: userId,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

/** DELETE /api/documents/[id]/access — revoke access (soft delete) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("documents", "manage");
  if (block) return block;

  try {
    const body = await req.json();
    const { accessId } = body;

    await db
      .update(documentAccess)
      .set({ revokedBy: userId, revokedAt: new Date() })
      .where(
        and(
          eq(documentAccess.id, accessId),
          eq(documentAccess.documentId, documentId),
          eq(documentAccess.organizationId, orgId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
