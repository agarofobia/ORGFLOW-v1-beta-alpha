// DELETE /api/comments/[id] — borrar comentario.
// Permisos: autor del comentario o admin de la org.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { taskComments, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, orgRole, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = orgRole === "org:admin";

  try {
    const comment = (await db.select().from(taskComments)
      .where(and(eq(taskComments.id, id), eq(taskComments.organizationId, orgId))).limit(1))[0];
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Permisos
    if (!isAdmin) {
      const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
      if (!userRow || comment.authorUserId !== userRow.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    await db.delete(taskComments)
      .where(and(eq(taskComments.id, id), eq(taskComments.organizationId, orgId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
