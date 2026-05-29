import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logActivity } from "@/lib/project-activity";

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
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.vfp !== undefined) updates.vfp = body.vfp;
    if (body.ownerEmployeeId !== undefined) updates.ownerEmployeeId = body.ownerEmployeeId;
    if (body.status !== undefined) updates.status = body.status;

    const result = await db
      .update(projects)
      .set(updates)
      .where(and(eq(projects.id, id), eq(projects.organizationId, orgId)))
      .returning();
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Log activity para cambios importantes
    if (body.vfp !== undefined) {
      await logActivity({ projectId: id, organizationId: orgId, clerkUserId, type: "vfp_updated", payload: {} });
    }
    if (body.ownerEmployeeId !== undefined) {
      await logActivity({ projectId: id, organizationId: orgId, clerkUserId, type: "owner_changed", payload: { newOwnerId: body.ownerEmployeeId } });
    }

    return NextResponse.json(result[0]);
  } catch (err) {
    return apiError(err);
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
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.organizationId, orgId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
