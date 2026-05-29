import { auth } from "@clerk/nextjs/server";
import { advanceInstance } from "@/lib/bpm";
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
    const body = await req.json();
    const result = await advanceInstance({
      instanceId: id,
      completedNodeId: body.completedNodeId,
      output: body.output ?? {},
      completedBy: userId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
