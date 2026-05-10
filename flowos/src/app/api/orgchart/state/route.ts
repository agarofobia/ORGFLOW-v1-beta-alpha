import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { orgchartStates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ edges: [] });

  try {
    const rows = await db
      .select()
      .from(orgchartStates)
      .where(eq(orgchartStates.organizationId, orgId))
      .limit(1);
    return NextResponse.json({ edges: rows[0]?.edges ?? [] });
  } catch {
    return NextResponse.json({ edges: [] });
  }
}

export async function PUT(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { edges } = await req.json();

    // upsert
    const existing = await db
      .select({ id: orgchartStates.id })
      .from(orgchartStates)
      .where(eq(orgchartStates.organizationId, orgId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(orgchartStates)
        .set({ edges, updatedAt: new Date() })
        .where(eq(orgchartStates.organizationId, orgId));
    } else {
      await db
        .insert(orgchartStates)
        .values({ organizationId: orgId, edges });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
