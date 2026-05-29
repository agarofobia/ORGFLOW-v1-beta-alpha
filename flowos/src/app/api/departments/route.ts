import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(departments)
      .where(eq(departments.organizationId, orgId))
      .orderBy(departments.name);
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 });
    }

    const divisionId: string | null = body.divisionId ?? null;
    const sizeWidth: number = body.sizeWidth ?? 280;
    const sizeHeight: number = body.sizeHeight ?? 200;

    // Auto-posicionamiento: si no se pasa positionX/Y Y el depto va dentro de una división,
    // colocarlo a la derecha del último depto existente en esa división. Evita el bug de
    // departamentos pisándose unos a otros cuando todos quedan en (0,0).
    let positionX: number = body.positionX ?? 0;
    let positionY: number = body.positionY ?? 0;
    const userProvidedPos = body.positionX !== undefined || body.positionY !== undefined;
    if (!userProvidedPos && divisionId) {
      const siblings = await db
        .select()
        .from(departments)
        .where(and(
          eq(departments.organizationId, orgId),
          eq(departments.divisionId, divisionId),
        ));
      const PAD = 16;
      const GAP = 12;
      const HEADER_H = 80;
      if (siblings.length === 0) {
        positionX = PAD;
        positionY = HEADER_H + PAD;
      } else {
        // Encontrar el sibling más a la derecha
        const rightmost = siblings.reduce((max, d) => {
          const right = (d.positionX ?? 0) + (d.sizeWidth ?? 280);
          const maxRight = (max.positionX ?? 0) + (max.sizeWidth ?? 280);
          return right > maxRight ? d : max;
        });
        positionX = (rightmost.positionX ?? 0) + (rightmost.sizeWidth ?? 280) + GAP;
        positionY = rightmost.positionY ?? (HEADER_H + PAD);
      }
    }

    const result = await db
      .insert(departments)
      .values({
        organizationId: orgId,
        name: body.name.trim(),
        divisionId,
        color: body.color ?? "#C8902C",
        positionX,
        positionY,
        sizeWidth,
        sizeHeight,
        headEmployeeId: body.headEmployeeId ?? null,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
