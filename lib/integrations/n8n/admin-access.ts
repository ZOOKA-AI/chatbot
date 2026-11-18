/**
 * Who may read the n8n admin dashboard.
 *
 * Kept as a pure decision instead of an `if` inside a page and again inside a route: two copies of an
 * authorization rule drift, and the copy that drifts is the one nobody tested. Operational staff are
 * excluded on purpose — seeing every workflow name and every failed execution is an owner/admin view.
 */
export type N8nAdminRole = "owner" | "admin" | "member" | string | null | undefined;

export type N8nAdminAccessInput = {
  role: N8nAdminRole;
  userType?: string | null;
};

export type N8nAdminAccess = "allowed" | "unauthorized" | "forbidden";

export function decideN8nAdminAccess(
  context: N8nAdminAccessInput | null
): N8nAdminAccess {
  if (!context) return "unauthorized";
  if (context.userType && context.userType !== "regular") return "unauthorized";
  return context.role === "owner" || context.role === "admin"
    ? "allowed"
    : "forbidden";
}
