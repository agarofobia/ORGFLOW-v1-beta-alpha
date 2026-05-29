// POST /api/notifications/[id]/read — marca una notificación como leída.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userRow.id),
        eq(notifications.organizationId, orgId),
      ));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
