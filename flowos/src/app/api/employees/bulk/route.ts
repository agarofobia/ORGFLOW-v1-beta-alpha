// PATCH /api/employees/bulk
//
// Update masivo de empleados. Body:
// {
//   employeeIds: string[],
//   updates: {
//     managerId?: string | null,
//     departmentId?: string | null,
//     unitId?: string | null,
//     status?: "active" | "inactive" | "on_leave",
//     color?: string,
//   }
// }
//
// Permission: employees.edit + (depende de los campos) org_chart.edit

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";

export async function PATCH(req: NextRequest) {
  const block = await requirePermission("employees", "edit");
  if (block) return block;
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!Array.isArray(body.employeeIds) || body.employeeIds.length === 0) {
      return NextResponse.json({ error: "employeeIds requerido (array no vacío)" }, { status: 400 });
    }
    if (!body.updates || typeof body.updates !== "object") {
      return NextResponse.json({ error: "updates requerido" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if ("managerId" in body.updates) updates.managerId = body.updates.managerId;
    if ("departmentId" in body.updates) updates.departmentId = body.updates.departmentId;
    if ("unitId" in body.updates) updates.unitId = body.updates.unitId;
    if ("divisionId" in body.updates) updates.divisionId = body.updates.divisionId;
    if (body.updates.status && ["active", "inactive", "on_leave"].includes(body.updates.status)) {
      updates.status = body.updates.status;
    }
    if (typeof body.updates.color === "string") updates.color = body.updates.color;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Sin campos válidos para actualizar" }, { status: 400 });
    }

    const result = await db
      .update(employees)
      .set(updates)
      .where(and(
        eq(employees.organizationId, orgId),
        inArray(employees.id, body.employeeIds as string[]),
      ))
      .returning({ id: employees.id });

    return NextResponse.json({
      ok: true,
      updated: result.length,
      ids: result.map((r) => r.id),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
