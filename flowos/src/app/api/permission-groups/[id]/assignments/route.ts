import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { permissionAssignments, employees, departments, divisions, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/require-permission";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(permissionAssignments)
      .where(
        and(
          eq(permissionAssignments.groupId, id),
          eq(permissionAssignments.organizationId, orgId)
        )
      );

    // Enriquecer cada fila con un displayName para que la UI pueda mostrar
    // chips legibles ("Carolina Pérez" en vez de un uuid).
    const empIds = rows.filter(r => r.subjectType === "employee").map(r => r.subjectId);
    const deptIds = rows.filter(r => r.subjectType === "department").map(r => r.subjectId);
    const divIds = rows.filter(r => r.subjectType === "division").map(r => r.subjectId);

    const [empRows, deptRows, divRows] = await Promise.all([
      empIds.length
        ? db.select({ id: employees.id, name: employees.fullName }).from(employees).where(inArray(employees.id, empIds))
        : [],
      deptIds.length
        ? db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds))
        : [],
      divIds.length
        ? db.select({ id: divisions.id, name: divisions.name }).from(divisions).where(inArray(divisions.id, divIds))
        : [],
    ]);

    const empMap = new Map(empRows.map(e => [e.id, e.name]));
    const deptMap = new Map(deptRows.map(d => [d.id, d.name]));
    const divMap = new Map(divRows.map(d => [d.id, d.name]));

    // Para subjectType "user", el subjectId es el clerkId — resolver el fullName
    const userClerkIds = rows.filter(r => r.subjectType === "user").map(r => r.subjectId);
    const userRows = userClerkIds.length
      ? await db.select({ clerkId: users.clerkId, name: users.fullName, email: users.email })
          .from(users).where(inArray(users.clerkId, userClerkIds))
      : [];
    const userMap = new Map(userRows.map(u => [u.clerkId, u.name ?? u.email]));

    const enriched = rows.map(r => ({
      ...r,
      displayName:
        r.subjectType === "employee" ? (empMap.get(r.subjectId) ?? "Empleado eliminado") :
        r.subjectType === "department" ? (deptMap.get(r.subjectId) ?? "Depto eliminado") :
        r.subjectType === "division" ? (divMap.get(r.subjectId) ?? "División eliminada") :
        r.subjectType === "user" ? (userMap.get(r.subjectId) ?? r.subjectId) :
        r.subjectId,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { id: groupId } = await params;
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { subjectType, subjectId } = body;

    if (!subjectType || !subjectId) {
      return NextResponse.json({ error: "subjectType y subjectId son requeridos" }, { status: 400 });
    }

    // Upsert — evitar duplicados
    const existing = await db
      .select({ id: permissionAssignments.id })
      .from(permissionAssignments)
      .where(
        and(
          eq(permissionAssignments.groupId, groupId),
          eq(permissionAssignments.organizationId, orgId),
          eq(permissionAssignments.subjectType, subjectType),
          eq(permissionAssignments.subjectId, subjectId)
        )
      )
      .limit(1);

    if (existing[0]) return NextResponse.json(existing[0]);

    const result = await db
      .insert(permissionAssignments)
      .values({
        organizationId: orgId,
        groupId,
        subjectType,
        subjectId,
        assignedBy: userId,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const block = await requirePermission("settings", "manage");
  if (block) return block;
  const { id: groupId } = await params;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { subjectType, subjectId } = body;

    await db
      .delete(permissionAssignments)
      .where(
        and(
          eq(permissionAssignments.groupId, groupId),
          eq(permissionAssignments.organizationId, orgId),
          eq(permissionAssignments.subjectType, subjectType),
          eq(permissionAssignments.subjectId, subjectId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
