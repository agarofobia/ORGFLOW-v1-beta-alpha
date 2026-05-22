// GET /api/tasks/[id]/attachments — lista attachments de la tarea
// POST /api/tasks/[id]/attachments — registrar attachment ya subido a Storage
//   Body: { fileName, fileUrl, fileType?, fileSize? }
//   El upload físico va por /api/upload (ya existente). Acá solo guardamos el metadata.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { taskAttachments, tasks, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db.select().from(taskAttachments)
      .where(and(eq(taskAttachments.taskId, id), eq(taskAttachments.organizationId, orgId)))
      .orderBy(desc(taskAttachments.uploadedAt));
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.fileName || !body.fileUrl) {
      return NextResponse.json({ error: "fileName y fileUrl son requeridos" }, { status: 400 });
    }

    // Validar que la tarea exista
    const task = (await db.select({ id: tasks.id })
      .from(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId))).limit(1))[0];
    if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

    // Resolver users row
    const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];

    const result = await db.insert(taskAttachments).values({
      taskId: id,
      organizationId: orgId,
      fileName: String(body.fileName),
      fileUrl: String(body.fileUrl),
      fileType: body.fileType ?? null,
      fileSize: body.fileSize ?? null,
      uploadedByUserId: userRow?.id ?? null,
    }).returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
