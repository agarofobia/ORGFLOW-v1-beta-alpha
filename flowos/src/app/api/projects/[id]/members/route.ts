import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { projectMembers, employees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Join con employees para traer nombre y título
    const rows = await db
      .select({
        id: projectMembers.id,
        projectId: projectMembers.projectId,
        employeeId: projectMembers.employeeId,
        role: projectMembers.role,
        addedAt: projectMembers.addedAt,
        fullName: employees.fullName,
        jobTitle: employees.jobTitle,
        color: employees.color,
      })
      .from(projectMembers)
      .leftJoin(employees, eq(projectMembers.employeeId, employees.id))
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.organizationId, orgId)));
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { employeeId, role } = body;
    if (!employeeId) return NextResponse.json({ error: "employeeId es requerido" }, { status: 400 });

    // Evitar duplicados
    const existing = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.organizationId, orgId),
          eq(projectMembers.employeeId, employeeId)
        )
      )
      .limit(1);
    if (existing[0]) return NextResponse.json(existing[0]);

    const result = await db
      .insert(projectMembers)
      .values({
        projectId,
        organizationId: orgId,
        employeeId,
        role: role ?? "member",
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { memberId } = body;
    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.id, memberId),
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.organizationId, orgId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
