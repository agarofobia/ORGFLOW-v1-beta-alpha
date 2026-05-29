import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";
import { validateBody } from "@/lib/validate";
import { dispatchWebhook } from "@/lib/webhooks";
import { z } from "zod";

const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "name es requerido"),
  description: z.string().optional().nullable(),
});

export async function GET() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, orgId));
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("projects", "create");
  if (block) return block;

  try {
    const body = await req.json();
    const v = validateBody(projectCreateSchema, body);
    if ("response" in v) return v.response;
    const result = await db
      .insert(projects)
      .values({
        organizationId: orgId,
        name: v.data.name,
        description: v.data.description ?? undefined,
        // ownerId es UUID que apunta a users.id (tabla interna), no el Clerk user ID
        // Se omite para evitar error de tipo uuid
      })
      .returning();
    if (result[0]) {
      dispatchWebhook({
        organizationId: orgId,
        eventType: "project.created",
        payload: { projectId: result[0].id, name: result[0].name, description: result[0].description },
      });
    }
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
