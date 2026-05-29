import { auth } from "@clerk/nextjs/server";
import { startInstance } from "@/lib/bpm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const result = await startInstance({
      processDefinitionId: id,
      organizationId: orgId,
      startedBy: userId,
      context: body.context ?? {},
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    // result = { instanceId, projectId? } — projectId presente si la definition tenía template asociado
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
