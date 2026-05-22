import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processInstances } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

// GET /api/instances — lista todas las instancias de la org (para seguimiento)
export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await db
      .select()
      .from(processInstances)
      .where(eq(processInstances.organizationId, orgId))
      .orderBy(desc(processInstances.startedAt));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
