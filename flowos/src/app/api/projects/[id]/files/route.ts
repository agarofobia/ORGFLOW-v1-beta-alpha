import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { documents, projectFiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { apiError } from "@/lib/api-error";

// GET /api/projects/[id]/files — list files linked to project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  try {
    const rows = await db
      .select({
        linkId: projectFiles.id,
        addedAt: projectFiles.addedAt,
        id: documents.id,
        title: documents.title,
        content: documents.content,
        createdAt: documents.createdAt,
      })
      .from(projectFiles)
      .innerJoin(documents, eq(projectFiles.documentId, documents.id))
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          eq(projectFiles.organizationId, orgId)
        )
      );
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/projects/[id]/files — create document + link to project in a single transaction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const body = await req.json();
  const { title, fileType, size, storageUrl, data } = body as {
    title: string;
    fileType: string;
    size: number;
    storageUrl?: string;
    data?: string; // base64 legacy
  };

  if (!title || (!storageUrl && !data)) return NextResponse.json({ error: "title and storageUrl required" }, { status: 400 });

  try {
    const result = await db.transaction(async (tx) => {
      // Create document
      const [doc] = await tx
        .insert(documents)
        .values({
          organizationId: orgId,
          title: title.trim(),
          content: { type: "file", fileType: fileType ?? "application/octet-stream", size: size ?? 0, storageUrl, data },
        })
        .returning({ id: documents.id, title: documents.title, createdAt: documents.createdAt, content: documents.content });

      // Link to project
      const [link] = await tx
        .insert(projectFiles)
        .values({
          projectId,
          documentId: doc.id,
          organizationId: orgId,
          addedBy: userId,
        })
        .returning({ linkId: projectFiles.id, addedAt: projectFiles.addedAt });

      return { ...doc, linkId: link.linkId, addedAt: link.addedAt };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/projects/[id]/files — unlink (and delete document)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const block = await requirePermission("projects", "delete");
  if (block) return block;

  const { id: projectId } = await params;
  const { linkId, documentId } = await req.json() as { linkId: string; documentId: string };

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(projectFiles)
        .where(
          and(
            eq(projectFiles.id, linkId),
            eq(projectFiles.projectId, projectId),
            eq(projectFiles.organizationId, orgId)
          )
        );
      await tx
        .delete(documents)
        .where(
          and(eq(documents.id, documentId), eq(documents.organizationId, orgId))
        );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
