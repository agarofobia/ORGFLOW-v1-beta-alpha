import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processDefinitions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [data] = await db
      .select()
      .from(processDefinitions)
      .where(
        and(
          eq(processDefinitions.id, id),
          eq(processDefinitions.organizationId, orgId)
        )
      )
      .limit(1);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const [result] = await db
      .update(processDefinitions)
      .set({
        name: body.name,
        description: body.description,
        category: body.category,
        status: body.status,
        nodes: body.nodes,
        edges: body.edges,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(processDefinitions.id, id),
          eq(processDefinitions.organizationId, orgId)
        )
      )
      .returning();
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db
      .delete(processDefinitions)
      .where(
        and(
          eq(processDefinitions.id, id),
          eq(processDefinitions.organizationId, orgId)
        )
      );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
