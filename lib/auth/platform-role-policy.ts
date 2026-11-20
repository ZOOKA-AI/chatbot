/**
 * Pure platform-role rules, free of server-only imports so they can be tested.
 *
 * Platform roles are separate from workspace roles on purpose: owning a
 * workspace is something every sign-up gets for free, so it can never imply
 * platform administration.
 */

export type PlatformRoleName = "super_admin" | "admin";

const RANK: Record<PlatformRoleName, number> = { admin: 1, super_admin: 2 };

export function isPlatformRoleName(value: unknown): value is PlatformRoleName {
  return value === "super_admin" || value === "admin";
}

/** True when `held` is at least `required`. Anything unknown is no role at all. */
export function platformRoleSatisfies(
  held: unknown,
  required: PlatformRoleName
): boolean {
  if (!isPlatformRoleName(held)) return false;
  return RANK[held] >= RANK[required];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
