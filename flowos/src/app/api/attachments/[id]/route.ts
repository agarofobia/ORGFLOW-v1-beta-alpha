// DELETE /api/attachments/[id] — borra el attachment (solo metadata, el archivo en Storage queda).
// Permisos: uploader o admin.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { taskAttachments, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, orgRole, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("projects", "delete");
  if (block) return block;
  const isAdmin = orgRole === "org:admin";

  try {
    const att = (await db.select().from(taskAttachments)
      .where(and(eq(taskAttachments.id, id), eq(taskAttachments.organizationId, orgId))).limit(1))[0];
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isAdmin) {
      const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
      if (!userRow || att.uploadedByUserId !== userRow.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    await db.delete(taskAttachments)
      .where(and(eq(taskAttachments.id, id), eq(taskAttachments.organizationId, orgId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
