import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserPermissions } from "@/lib/get-user-permissions";

export async function GET() {
  const { orgId, userId, orgRole } = await auth();
  if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const permissions = await getUserPermissions(orgId, userId, orgRole);
    return NextResponse.json(permissions);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
