import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { permissionAssignments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(permissionAssignments)
      .where(
        and(
          eq(permissionAssignments.groupId, id),
          eq(permissionAssignments.organizationId, orgId)
        )
      );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { subjectType, subjectId } = body;

    if (!subjectType || !subjectId) {
      return NextResponse.json({ error: "subjectType y subjectId son requeridos" }, { status: 400 });
    }

    // Upsert — evitar duplicados
    const existing = await db
      .select({ id: permissionAssignments.id })
      .from(permissionAssignments)
      .where(
        and(
          eq(permissionAssignments.groupId, groupId),
          eq(permissionAssignments.organizationId, orgId),
          eq(permissionAssignments.subjectType, subjectType),
          eq(permissionAssignments.subjectId, subjectId)
        )
      )
      .limit(1);

    if (existing[0]) return NextResponse.json(existing[0]);

    const result = await db
      .insert(permissionAssignments)
      .values({
        organizationId: orgId,
        groupId,
        subjectType,
        subjectId,
        assignedBy: userId,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { subjectType, subjectId } = body;

    await db
      .delete(permissionAssignments)
      .where(
        and(
          eq(permissionAssignments.groupId, groupId),
          eq(permissionAssignments.organizationId, orgId),
          eq(permissionAssignments.subjectType, subjectType),
          eq(permissionAssignments.subjectId, subjectId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
