import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/app/(auth)/auth";
import {
  isPlatformRoleName,
  isUserId,
  type PlatformRoleName,
  platformRoleSatisfies,
} from "@/lib/auth/platform-role-policy";
import { adminDb } from "@/lib/db/queries";
import { platformAuditLog, platformRole } from "@/lib/db/schema";

export type PlatformAdmin = {
  userId: string;
  email: string | null;
  role: PlatformRoleName;
};

/**
 * The platform role held by a user id, read from the database on every call.
 *
 * Never from the session token: a JWT claim can be stale after a revoke, and a
 * role field in the token would be one more thing to forge. Any failure (table
 * not migrated, connection refused) is "no role", so the gate fails closed.
 */
export async function getPlatformRole(userId: string): Promise<PlatformRoleName | null> {
  if (!isUserId(userId)) return null;
  try {
    const [row] = await adminDb()
      .select({ role: platformRole.role })
      .from(platformRole)
      .where(eq(platformRole.userId, userId))
      .limit(1);
    return isPlatformRoleName(row?.role) ? row.role : null;
  } catch (error) {
    console.error("[platform-role] lookup failed; treating as no role", {
      message: (error as Error)?.message?.slice(0, 120),
    });
    return null;
  }
}

/**
 * Appends to the platform audit trail. Best effort by design: an audit write
 * that fails is logged loudly but never turns a denial into an allow, and never
 * blocks the response it describes.
 */
export async function recordPlatformAudit(entry: {
  actorUserId: string | null;
  action: string;
  target?: string | null;
  outcome: "allowed" | "denied" | "error";
  metadata?: Record<string, unknown>;
}) {
  try {
    await adminDb()
      .insert(platformAuditLog)
      .values({
        actorUserId: isUserId(entry.actorUserId) ? entry.actorUserId : null,
        action: entry.action.slice(0, 64),
        target: entry.target?.slice(0, 256) ?? null,
        outcome: entry.outcome,
        metadata: entry.metadata ?? {},
      });
  } catch (error) {
    console.error("[platform-audit] write failed", {
      action: entry.action,
      outcome: entry.outcome,
      message: (error as Error)?.message?.slice(0, 120),
    });
  }
}

/**
 * The single server-side gate for platform administration.
 *
 * Returns the admin when the signed-in user holds at least `required`, otherwise
 * null. `action` names what was attempted, for the audit trail; denials are
 * always recorded, and allowed access is recorded for the actions passed with
 * `auditAllowed`.
 */
export async function requirePlatformRole(
  required: PlatformRoleName,
  action: string,
  options: { auditAllowed?: boolean } = {}
): Promise<PlatformAdmin | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }
  const role = await getPlatformRole(userId);
  if (!platformRoleSatisfies(role, required)) {
    await recordPlatformAudit({
      actorUserId: userId,
      action,
      outcome: "denied",
      metadata: { required, held: role },
    });
    return null;
  }
  if (options.auditAllowed) {
    await recordPlatformAudit({
      actorUserId: userId,
      action,
      outcome: "allowed",
      metadata: { role },
    });
  }
  return { userId, email: session?.user?.email ?? null, role: role as PlatformRoleName };
}
