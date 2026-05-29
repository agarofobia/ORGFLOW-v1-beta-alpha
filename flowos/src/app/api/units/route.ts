import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { units } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(units)
      .where(eq(units.organizationId, orgId))
      .orderBy(units.name);
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 });
    }
    if (!body.departmentId) {
      return NextResponse.json({ error: "departmentId es requerido" }, { status: 400 });
    }
    const result = await db
      .insert(units)
      .values({
        organizationId: orgId,
        departmentId: body.departmentId,
        name: body.name.trim(),
        color: body.color ?? null,
        headEmployeeId: body.headEmployeeId ?? null,
        positionX: body.positionX ?? 0,
        positionY: body.positionY ?? 0,
        sizeWidth: body.sizeWidth ?? 260,
        sizeHeight: body.sizeHeight ?? 160,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
