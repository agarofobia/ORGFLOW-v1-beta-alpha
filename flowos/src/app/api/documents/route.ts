import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, orgId))
      .orderBy(desc(documents.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    // body.content = { type: 'file', fileName, fileType, fileSize, base64, visibility }
    // o body.content = { type: 'folder' }
    const result = await db
      .insert(documents)
      .values({
        organizationId: orgId,
        title: body.title,
        content: body.content ?? {},
        parentId: body.parentId ?? null,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
