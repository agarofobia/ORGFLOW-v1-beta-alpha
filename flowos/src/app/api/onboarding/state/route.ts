// GET /api/onboarding/state
//
// Devuelve si la org actual es "nueva" (sin estructura mínima) y qué pasos
// ya completó. El wizard usa esto para decidir si mostrarse + qué paso enseñar.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { divisions, departments, employees, projects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Contar entidades en paralelo
    const [divCount, deptCount, empCount, projCount] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(divisions).where(eq(divisions.organizationId, orgId)),
      db.select({ c: sql<number>`count(*)::int` }).from(departments).where(eq(departments.organizationId, orgId)),
      db.select({ c: sql<number>`count(*)::int` }).from(employees).where(eq(employees.organizationId, orgId)),
      db.select({ c: sql<number>`count(*)::int` }).from(projects).where(eq(projects.organizationId, orgId)),
    ]);

    const counts = {
      divisions: divCount[0]?.c ?? 0,
      departments: deptCount[0]?.c ?? 0,
      employees: empCount[0]?.c ?? 0,
      projects: projCount[0]?.c ?? 0,
    };

    // Org "nueva" = no tiene NI 1 división NI 1 empleado.
    // El wizard apunta a guiar la setup inicial.
    const isEmpty = counts.divisions === 0 && counts.employees === 0;

    return NextResponse.json({
      isEmpty,
      counts,
      // Sugerencia de próximo paso para el wizard
      nextStep:
        counts.divisions === 0 ? "division" :
        counts.departments === 0 ? "departments" :
        counts.employees === 0 ? "employees" :
        "tour",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
