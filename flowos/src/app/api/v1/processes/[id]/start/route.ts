// POST /api/v1/processes/:id/start — inicia una instancia (write)

import { NextRequest, NextResponse } from "next/server";
import { requireApiToken } from "@/lib/api-token-auth";
import { startInstance } from "@/lib/bpm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiToken(req, "write");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await startInstance({
      processDefinitionId: id,
      organizationId: ctx.organizationId,
      startedBy: `api-token:${ctx.tokenId}`,
      context: body.context ?? {},
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
