// GET /api/v1/projects   — list (requires read scope)
// POST /api/v1/projects   — create (requires write scope)

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireApiToken } from "@/lib/api-token-auth";
import { dispatchWebhook } from "@/lib/webhooks";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;

  try {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, ctx.organizationId));
    return NextResponse.json({ projects: rows });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiToken(req, "write");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name requerido" }, { status: 400 });
    }
    const [created] = await db
      .insert(projects)
      .values({
        organizationId: ctx.organizationId,
        name: body.name.trim(),
        description: body.description ?? null,
        vfp: body.vfp ?? null,
        ownerEmployeeId: body.ownerEmployeeId ?? null,
        status: body.status ?? "activo",
      })
      .returning();

    dispatchWebhook({
      organizationId: ctx.organizationId,
      eventType: "project.created",
      payload: { projectId: created.id, name: created.name, viaApi: true },
    });

    return NextResponse.json({ project: created }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
