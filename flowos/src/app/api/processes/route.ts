import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processDefinitions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await db
      .select()
      .from(processDefinitions)
      .where(eq(processDefinitions.organizationId, orgId))
      .orderBy(desc(processDefinitions.createdAt));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const [result] = await db
      .insert(processDefinitions)
      .values({
        organizationId: orgId,
        name: body.name ?? "Nuevo proceso",
        description: body.description ?? null,
        category: body.category ?? "general",
        createdBy: userId,
      })
      .returning();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
