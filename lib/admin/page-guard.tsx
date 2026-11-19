import "server-only";

import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang, type Lang } from "@/lib/i18n";

export type AdminPageContext = {
  lang: Lang;
  organizationId: string;
  role: "admin" | "owner";
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
  if (context.role !== "admin" && context.role !== "owner") {
    return null;
  }
  return {
    lang,
    organizationId: context.organizationId,
    role: context.role,
    userId: context.user.id,
  };
}

export function AdminDenied({ lang = "ar" }: { lang?: Lang }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      {lang === "ar" ? "تحتاج صلاحية أدمن لعرض هذا القسم." : "You need an admin role to view this section."}
    </div>
  );
}
