import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { inboxTasks } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    const conditions = [eq(inboxTasks.organizationId, orgId)];
    if (status) {
      conditions.push(
        eq(inboxTasks.status, status as "pending" | "claimed" | "completed" | "skipped" | "cancelled")
      );
    }

    const data = await db
      .select()
      .from(inboxTasks)
      .where(and(...conditions))
      .orderBy(desc(inboxTasks.createdAt));

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
