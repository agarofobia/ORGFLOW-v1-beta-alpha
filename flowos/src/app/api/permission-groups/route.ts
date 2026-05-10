import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { permissionGroups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { PRESETS, PresetKey } from "@/lib/permissions";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(permissionGroups)
      .where(eq(permissionGroups.organizationId, orgId))
      .orderBy(permissionGroups.name);
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

    // Crear desde preset
    if (body.preset) {
      const preset = PRESETS[body.preset as PresetKey];
      if (!preset) return NextResponse.json({ error: "Preset inválido" }, { status: 400 });
      const result = await db
        .insert(permissionGroups)
        .values({
          organizationId: orgId,
          name: preset.name,
          description: preset.description,
          modules: preset.modules,
          isPreset: true,
        })
        .returning();
      return NextResponse.json(result[0], { status: 201 });
    }

    // Crear custom
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 });
    }
    const result = await db
      .insert(permissionGroups)
      .values({
        organizationId: orgId,
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        modules: body.modules ?? {},
        isPreset: false,
      })
      .returning();
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
