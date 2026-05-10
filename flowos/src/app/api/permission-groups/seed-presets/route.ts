// POST /api/permission-groups/seed-presets
// Crea los 4 grupos preset para la org si aún no existen.
// Llamar una vez al crear la organización o desde Settings si faltan.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { permissionGroups } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PRESETS, PresetKey } from "@/lib/permissions";

export async function POST() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const existing = await db
      .select({ name: permissionGroups.name })
      .from(permissionGroups)
      .where(
        and(
          eq(permissionGroups.organizationId, orgId),
          eq(permissionGroups.isPreset, true)
        )
      );
    const existingNames = new Set(existing.map((r) => r.name));

    const created = [];
    for (const key of Object.keys(PRESETS) as PresetKey[]) {
      const preset = PRESETS[key];
      if (existingNames.has(preset.name)) continue;
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
      created.push(result[0]);
    }

    return NextResponse.json({ created: created.length, groups: created });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
