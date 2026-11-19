/**
 * The admin-only slice of the sidebar.
 *
 * Extracted from the component for one reason: the visibility rule is a security boundary, not styling.
 * A pure function can be tested for every role (including a missing role, which is what an unauthenticated
 * render looks like), while an inline `role === "owner" &&` inside JSX can only be checked by eye.
 */
export type AdminNavItem = {
  href: string;
  labelEn: string;
  labelAr: string;
};

export type AdminNavRole = "owner" | "admin" | "member" | null | undefined;

// Lower-case on purpose: scripts/check-placeholders.mjs treats an ALL_CAPS identifier name as an
// unresolved template placeholder and fails the build (the same trap that once broke a deploy).
const n8nAdminItem: AdminNavItem = {
  href: "/workspace/admin/n8n",
  labelEn: "n8n automation",
  labelAr: "أتمتة n8n",
};

/** Owner and admin only. Members, guests and anonymous renders get nothing. */
export function adminNavItems(role: AdminNavRole): AdminNavItem[] {
  return role === "owner" || role === "admin" ? [n8nAdminItem] : [];
}

export function adminNavSectionLabel(isArabic: boolean): string {
  return isArabic ? "الإدارة" : "Admin";
}
