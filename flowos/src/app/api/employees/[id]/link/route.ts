// POST /api/employees/[id]/link
// Vincula este employee con el usuario Clerk actual.
// Auto-provisiona la row de `users` si no existe.
// Restricción: solo permite vincular si el employee actualmente no tiene user_id
// (para que un usuario no se "robe" otro puesto). El admin puede sobrescribir.

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, employees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, orgRole, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = orgRole === "org:admin";

  try {
    // Auto-provision users row
    let userRow = (await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) {
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
      const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;
      const inserted = await db.insert(users).values({
        clerkId: clerkUserId,
        email,
        fullName,
        imageUrl: clerkUser?.imageUrl ?? null,
      }).returning();
      userRow = inserted[0];
    }

    // Validar que el employee exista en esta org
    const empRow = (await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .limit(1))[0];
    if (!empRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Si ya tiene userId distinto, solo admin puede sobrescribir
    if (empRow.userId && empRow.userId !== userRow.id && !isAdmin) {
      return NextResponse.json({ error: "Este puesto ya está vinculado a otro usuario" }, { status: 403 });
    }

    // Antes de vincular, "desvincular" cualquier otro employee ligado al mismo user en esta org
    // (un usuario = un puesto activo por org)
    await db.update(employees)
      .set({ userId: null })
      .where(and(eq(employees.organizationId, orgId), eq(employees.userId, userRow.id)));

    const result = await db.update(employees)
      .set({ userId: userRow.id })
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();
    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/employees/[id]/link → desvincula este employee del usuario actual (o cualquier user si admin)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { orgId, orgRole, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = orgRole === "org:admin";

  try {
    const userRow = (await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1))[0];
    if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const empRow = (await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .limit(1))[0];
    if (!empRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Solo el dueño del vínculo o un admin puede desvincular
    if (empRow.userId !== userRow.id && !isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const result = await db.update(employees)
      .set({ userId: null })
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();
    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
