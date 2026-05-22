// POST /api/notifications/read-all — marca todas las notificaciones del current user como leídas.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.userId, userRow.id),
        eq(notifications.organizationId, orgId),
        isNull(notifications.readAt),
      ));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
