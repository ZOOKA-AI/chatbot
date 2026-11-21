import "server-only";

import { redirect } from "next/navigation";

import { requirePlatformRole } from "@/lib/auth/platform-role";
import type { PlatformRoleName } from "@/lib/auth/platform-role-policy";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang, type Lang } from "@/lib/i18n";

export type AdminPageContext = {
  lang: Lang;
  /** The admin's own workspace, for the sections that are still workspace-scoped. */
  organizationId: string;
  /** The admin's role in that workspace (display only; never an authorisation input). */
  role: string;
  platformRole: PlatformRoleName;
  userId: string;
};

/**
 * The per-page half of the admin gate.
 *
 * The layout refuses first, and every page refuses again on its own, so a route added later without
 * the layout still cannot read admin data. Returns null instead of throwing, and the page renders the
 * refusal it gets.
 */
export async function adminPageContext(): Promise<AdminPageContext | null> {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }
  const lang = await getLang();
  // Platform administration is a grant of its own (PlatformRole), read by user id
  // on every request. Owning a workspace, which every sign-up does, is not enough.
  const admin = await requirePlatformRole("admin", "admin.page");
  if (!admin || admin.userId !== context.user.id) {
    return null;
  }
  return {
    lang,
    organizationId: context.organizationId,
    role: context.role,
    platformRole: admin.role,
    userId: admin.userId,
  };
}

export function AdminDenied({ lang = "ar" }: { lang?: Lang }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      {lang === "ar"
        ? "هذا القسم لإدارة المنصة فقط. ملكية مساحة عمل لا تمنح الوصول."
        : "This section is for platform administrators only. Owning a workspace does not grant access."}
    </div>
  );
}
