import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { processDefinitions } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parentId = searchParams.get("parentId"); // null string = root, specific id = folder contents

  try {
    const parentFilter =
      parentId === null
        ? isNull(processDefinitions.parentId)
        : eq(processDefinitions.parentId, parentId);

    const data = await db
      .select()
      .from(processDefinitions)
      .where(and(eq(processDefinitions.organizationId, orgId), parentFilter))
      .orderBy(desc(processDefinitions.createdAt));
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("processes", "create");
  if (block) return block;

  try {
    const body = await req.json();

    // Clone mode: duplicate an existing process
    if (body.cloneFrom) {
      const [source] = await db
        .select()
        .from(processDefinitions)
        .where(and(eq(processDefinitions.id, body.cloneFrom), eq(processDefinitions.organizationId, orgId)))
        .limit(1);
      if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
      const [cloned] = await db
        .insert(processDefinitions)
        .values({
          organizationId: orgId,
          name: body.name ?? `${source.name} (copia)`,
          description: source.description,
          category: source.category,
          status: "draft" as const,
          nodes: source.nodes,
          edges: source.edges,
          createdBy: userId,
        })
        .returning();
      return NextResponse.json(cloned, { status: 201 });
    }

    const [result] = await db
      .insert(processDefinitions)
      .values({
        organizationId: orgId,
        name: body.name ?? (body.isFolder ? "Nueva carpeta" : "Nuevo proceso"),
        description: body.description ?? null,
        category: body.isFolder ? "folder" : (body.category ?? "general"),
        parentId: body.parentId ?? null,
        createdBy: userId,
      })
      .returning();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
