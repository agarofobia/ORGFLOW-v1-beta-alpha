// GET /api/v1/employees   — list (read)
// POST /api/v1/employees  — create (write)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireApiToken } from "@/lib/api-token-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const rows = await db.select().from(employees).where(eq(employees.organizationId, ctx.organizationId));
    return NextResponse.json({ employees: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiToken(req, "write");
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const body = await req.json();
    if (!body.fullName?.trim()) return NextResponse.json({ error: "fullName requerido" }, { status: 400 });
    const [created] = await db
      .insert(employees)
      .values({
        organizationId: ctx.organizationId,
        fullName: body.fullName.trim(),
        jobTitle: body.jobTitle ?? null,
        email: body.email ?? null,
        departmentId: body.departmentId ?? null,
        divisionId: body.divisionId ?? null,
        managerId: body.managerId ?? null,
        status: body.status ?? "active",
      })
      .returning();
    return NextResponse.json({ employee: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
