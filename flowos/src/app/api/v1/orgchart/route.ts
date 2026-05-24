// GET /api/v1/orgchart — devuelve estructura completa (divisiones + deptos)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { divisions, departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireApiToken } from "@/lib/api-token-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const [divs, depts] = await Promise.all([
      db.select().from(divisions).where(eq(divisions.organizationId, ctx.organizationId)),
      db.select().from(departments).where(eq(departments.organizationId, ctx.organizationId)),
    ]);
    return NextResponse.json({
      divisions: divs.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        departments: depts.filter((dep) => dep.divisionId === d.id).map((dep) => ({ id: dep.id, name: dep.name })),
      })),
      orphanDepartments: depts.filter((d) => !d.divisionId).map((d) => ({ id: d.id, name: d.name })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
