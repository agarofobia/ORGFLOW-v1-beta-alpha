// GET /api/notifications — devuelve notificaciones del current user (con auto-provision)
// Query: ?onlyUnread=true para filtrar

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const onlyUnread = searchParams.get("onlyUnread") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10) || 30, 100);

  try {
    // Resolver users row (auto-provision)
    let userRow = (await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) {
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
      const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;
      const inserted = await db.insert(users).values({
        clerkId: clerkUserId, email, fullName, imageUrl: clerkUser?.imageUrl ?? null,
      }).returning();
      userRow = inserted[0];
    }

    const whereClause = onlyUnread
      ? and(eq(notifications.userId, userRow.id), eq(notifications.organizationId, orgId), isNull(notifications.readAt))
      : and(eq(notifications.userId, userRow.id), eq(notifications.organizationId, orgId));

    const rows = await db.select().from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
