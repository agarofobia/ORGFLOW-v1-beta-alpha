import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processInstances } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await db
      .select()
      .from(processInstances)
      .where(
        and(
          eq(processInstances.processDefinitionId, id),
          eq(processInstances.organizationId, orgId)
        )
      )
      .orderBy(desc(processInstances.startedAt));
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}
