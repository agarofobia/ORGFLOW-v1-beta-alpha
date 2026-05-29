import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { divisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(divisions)
      .where(eq(divisions.organizationId, orgId))
      .orderBy(divisions.name);
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("org_chart", "create");
  if (block) return block;

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 });
    }
    const result = await db
      .insert(divisions)
      .values({
        organizationId: orgId,
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        color: body.color ?? "#3D7EFF",
        positionX: body.positionX ?? 0,
        positionY: body.positionY ?? 0,
        sizeWidth: body.sizeWidth ?? 500,
        sizeHeight: body.sizeHeight ?? 340,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
