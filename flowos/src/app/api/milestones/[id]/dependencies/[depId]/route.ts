// DELETE /api/milestones/[id]/dependencies/[depId] — quita la dependencia milestone→dependsOn

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { milestoneDependencies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  const { id, depId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.delete(milestoneDependencies)
      .where(and(
        eq(milestoneDependencies.milestoneId, id),
        eq(milestoneDependencies.dependsOnId, depId),
        eq(milestoneDependencies.organizationId, orgId),
      ));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
