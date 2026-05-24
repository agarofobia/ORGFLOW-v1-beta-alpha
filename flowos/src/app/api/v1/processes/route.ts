// GET /api/v1/processes  — list process definitions (read)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { processDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireApiToken } from "@/lib/api-token-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const rows = await db
      .select({
        id: processDefinitions.id,
        name: processDefinitions.name,
        description: processDefinitions.description,
        status: processDefinitions.status,
        category: processDefinitions.category,
      })
      .from(processDefinitions)
      .where(eq(processDefinitions.organizationId, ctx.organizationId));
    return NextResponse.json({ processes: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
