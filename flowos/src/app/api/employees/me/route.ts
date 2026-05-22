// GET /api/employees/me
// Devuelve el employee vinculado al usuario logueado de Clerk en la org actual.
// Si no hay row en `users` para el clerkId, la crea (auto-provision lazy).
// Si no hay employee vinculado, devuelve { employee: null, userId } para que la UI
// muestre el flow "vincular cuenta".

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, employees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const { orgId, userId: clerkUserId } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Resolver users row (auto-provision si no existe)
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

    // 2. Buscar employee vinculado en la org actual
    const empRow = (await db.select().from(employees)
      .where(and(eq(employees.organizationId, orgId), eq(employees.userId, userRow.id)))
      .limit(1))[0];

    return NextResponse.json({ employee: empRow ?? null, user: userRow });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
