import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  try {
    let query = db.select().from(tasks).where(eq(tasks.organizationId, orgId));
    if (projectId) {
      query = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.organizationId, orgId), eq(tasks.projectId, projectId)));
    }
    const data = await query;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const result = await db
      .insert(tasks)
      .values({
        projectId: body.projectId,
        organizationId: orgId,
        title: body.title,
        description: body.description,
        status: body.status || "todo",
        priority: body.priority || "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        sectionName: body.sectionName || "Sin sección",
        assigneeName: body.assigneeName,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
