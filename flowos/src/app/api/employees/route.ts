import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    const rows = await db
      .select()
      .from(employees)
      .where(
        includeInactive
          ? eq(employees.organizationId, orgId)
          : and(eq(employees.organizationId, orgId), eq(employees.status, "active"))
      );
    return NextResponse.json(rows);
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
      .insert(employees)
      .values({
        organizationId: orgId,
        fullName: body.fullName,
        jobTitle: body.jobTitle,
        description: body.description,
        email: body.email,
        phone: body.phone,
        salary: body.salary,
        color: body.color,
        positionX: body.positionX ?? 0,
        positionY: body.positionY ?? 0,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        departmentId: body.departmentId ?? null,
        divisionId: body.divisionId ?? null,
        managerId: body.managerId ?? null,
        metadata: body.metadata ?? {},
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
