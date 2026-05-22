// Helper para registrar eventos en project_activity.
// Se llama desde los endpoints que mutan tasks / milestones / project.
// No-op silencioso si falla (la actividad no debe romper la operación principal).

import { db } from "@/db";
import { projectActivity, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type ActivityType =
  | "task_created" | "task_completed" | "task_assigned" | "task_deleted"
  | "milestone_created" | "milestone_completed" | "milestone_deleted"
  | "vfp_updated" | "owner_changed" | "comment_added";

export async function logActivity(opts: {
  projectId: string;
  organizationId: string;
  clerkUserId: string | null | undefined;
  type: ActivityType;
  payload?: Record<string, unknown>;
}) {
  try {
    let actorUserId: string | null = null;
    if (opts.clerkUserId) {
      const u = (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, opts.clerkUserId)).limit(1))[0];
      actorUserId = u?.id ?? null;
    }
    await db.insert(projectActivity).values({
      projectId: opts.projectId,
      organizationId: opts.organizationId,
      actorUserId,
      type: opts.type,
      payload: opts.payload ?? {},
    });
  } catch (err) {
    // Activity logging es best-effort. No bloqueamos la operación principal si falla.
    console.warn("activity log failed:", String(err));
  }
}
