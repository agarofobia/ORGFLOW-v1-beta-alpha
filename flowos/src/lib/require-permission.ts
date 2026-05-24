// Helper server-side: verifica que el usuario actual tenga una acción específica.
// Devuelve un NextResponse 401/403 si no tiene permiso, o null si todo OK.
// Uso: const block = await requirePermission("settings", "manage"); if (block) return block;

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserPermissions } from "@/lib/get-user-permissions";
import { hasPermission, type Module, type Action } from "@/lib/permissions";

export async function requirePermission(
  module: Module,
  action: Action
): Promise<NextResponse | null> {
  const { orgId, userId, orgRole } = await auth();
  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const perms = await getUserPermissions(orgId, userId, orgRole);
  if (!hasPermission(perms, module, action)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
