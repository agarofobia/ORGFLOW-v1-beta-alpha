// GET /api/projects/[id]/activity — feed reciente de actividad del proyecto.
// Devuelve los últimos 50 eventos con info del actor (nombre + avatar).

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projectActivity, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

  try {
    const rows = await db.select({
      id: projectActivity.id,
      type: projectActivity.type,
      payload: projectActivity.payload,
      createdAt: projectActivity.createdAt,
      actorUserId: projectActivity.actorUserId,
      actorFullName: users.fullName,
      actorEmail: users.email,
      actorImageUrl: users.imageUrl,
    })
      .from(projectActivity)
      .leftJoin(users, eq(projectActivity.actorUserId, users.id))
      .where(and(
        eq(projectActivity.projectId, projectId),
        eq(projectActivity.organizationId, orgId),
      ))
      .orderBy(desc(projectActivity.createdAt))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}
