import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang } from "@/lib/i18n";

/**
 * The admin command center's gate.
 *
 * Fail-closed by construction: no session goes to the login page, and any role below admin is refused
 * here, before a single page below this layout runs its queries. Each page also re-checks the role, so
 * a future route added without this layout cannot quietly inherit access.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const allowed = context.role === "admin" || context.role === "owner";

  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-2xl p-6">
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-medium">
            {lang === "ar" ? "هذه اللوحة للأدمن فقط." : "This command center is admin-only."}
          </p>
          <p className="mt-1 text-xs text-rose-200/80">
            {lang === "ar"
              ? "دورك الحالي لا يمنح الوصول. لم يُقرأ أي بيانات إدارية."
              : "Your current role does not grant access. No admin data was read."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-white/10 bg-[#070d18] p-3 lg:w-60 lg:border-b-0 lg:border-e">
        <div className="mb-4 px-2">
          <p className="text-sm font-semibold text-white">
            {lang === "ar" ? "مركز قيادة ZOOKA-AI" : "ZOOKA-AI command center"}
          </p>
          <p dir="ltr" className="font-mono text-[10px] text-white/40">
            /admin · {context.role}
          </p>
        </div>
        <AdminNav lang={lang} />
      </aside>
      <main className="min-w-0 flex-1 bg-[#0b1220] p-4 lg:p-6">{children}</main>
    </div>
  );
}
