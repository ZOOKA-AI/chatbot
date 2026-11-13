import Link from "next/link";
import { redirect } from "next/navigation";
import {
  changeWorkspaceMemberRole,
  inviteWorkspaceMember,
  renameWorkspace,
  switchWorkspace,
} from "@/app/(chat)/workspace/actions";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { displayWorkspaceName } from "@/lib/workspace-name";
import {
  getWorkspaceInvitations,
  getWorkspaceMembers,
  getWorkspacesForUser,
} from "@/lib/db/queries";

export default async function WorkspacePage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const [members, invitations, workspaces] = await Promise.all([
    getWorkspaceMembers(context.organizationId),
    getWorkspaceInvitations(context.organizationId),
    getWorkspacesForUser(context.user.id),
  ]);
  const lang = await getLang();
  const workspaceName = displayWorkspaceName(context.workspace.name, lang);
  const canManage = context.role === "owner" || context.role === "admin";
  const ar = lang === "ar";
  const t = (arabic: string, english: string) => (ar ? arabic : english);
  const roleLabel = (role: string) =>
    role === "owner"
      ? t("المالك", "Owner")
      : role === "admin"
        ? t("مدير", "Admin")
        : t("عضو", "Member");
  const buttonClass =
    "rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm shadow-sm transition-colors hover:bg-primary/90";

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6"
      dir={dirOf(lang)}
      style={{ fontFamily: fontOf(lang) }}
    >
      <header className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {t("مساحة العمل الحالية", "Current workspace")}
          </p>
          <h1 className="font-semibold text-2xl">{workspaceName}</h1>
        </div>
        <Link className="text-sm underline" href="/workspace/billing">
          {t("الباقة والاستخدام", "Plan and usage")}
        </Link>
      </header>

      {workspaces.length > 1 && (
        <form action={switchWorkspace} className="flex items-center gap-3">
          <label className="text-sm" htmlFor="organizationId">
            {t("تبديل مساحة العمل", "Switch workspace")}
          </label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue={context.organizationId}
            id="organizationId"
            name="organizationId"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {displayWorkspaceName(workspace.name, lang)}
              </option>
            ))}
          </select>
          <button className={buttonClass} type="submit">
            {t("تبديل", "Switch")}
          </button>
        </form>
      )}

      <section className="flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="font-semibold text-lg">
          {t("إعدادات مساحة العمل", "Workspace settings")}
        </h2>
        {canManage ? (
          <form action={renameWorkspace} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm" htmlFor="name">
              {t("اسم مساحة العمل", "Workspace name")}
              <input
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={workspaceName}
                id="name"
                maxLength={80}
                minLength={2}
                name="name"
                required
              />
            </label>
            <button className={`w-fit ${buttonClass}`} type="submit">
              {t("حفظ الاسم", "Save name")}
            </button>
          </form>
        ) : (
          <p className="text-sm">{workspaceName}</p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="font-semibold text-lg">
          {t("الأعضاء", "Members")} ({members.length})
        </h2>
        <ul className="flex flex-col divide-y">
          {members.map((member) => (
            <li
              className="flex items-center justify-between gap-4 py-3 text-sm"
              key={member.userId}
            >
              <span>{member.email}</span>
              {canManage && member.role !== "owner" ? (
                <form action={changeWorkspaceMemberRole} className="flex gap-2">
                  <input name="userId" type="hidden" value={member.userId} />
                  <select
                    aria-label={`${t("دور", "Role for")} ${member.email}`}
                    className="rounded-md border bg-background px-2 py-1"
                    defaultValue={member.role}
                    name="role"
                  >
                    <option value="member">{t("عضو", "Member")}</option>
                    <option value="admin">{t("مدير", "Admin")}</option>
                  </select>
                  <button
                    className="rounded-full border px-3 py-1 font-medium"
                    type="submit"
                  >
                    {t("تحديث", "Update")}
                  </button>
                </form>
              ) : (
                <span className="text-muted-foreground">
                  {roleLabel(member.role)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="flex flex-col gap-4 rounded-lg border p-5">
          <h2 className="font-semibold text-lg">
            {t("دعوة عضو", "Invite a member")}
          </h2>
          <form action={inviteWorkspaceMember} className="flex flex-wrap gap-3">
            <input
              className="min-w-52 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              name="email"
              placeholder="name@example.com"
              required
              type="email"
            />
            <select
              aria-label={t("دور المدعو", "Invitation role")}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue="member"
              name="role"
            >
              <option value="member">{t("عضو", "Member")}</option>
              <option value="admin">{t("مدير", "Admin")}</option>
            </select>
            <button className={buttonClass} type="submit">
              {t("إنشاء دعوة", "Create invitation")}
            </button>
          </form>
          <p className="text-muted-foreground text-xs">
            {t(
              "تُحفظ الدعوات لمدة سبعة أيام. إرسال الدعوة بالبريد وقبولها ذاتيًا غير مفعّلين بعد.",
              "Invitations are recorded for seven days. Email delivery and self-service acceptance are not enabled yet."
            )}
          </p>
          {invitations.length > 0 && (
            <ul className="flex flex-col divide-y text-sm">
              {invitations.map((invitation) => (
                <li
                  className="flex justify-between gap-3 py-2"
                  key={invitation.id}
                >
                  <span>{invitation.email}</span>
                  <span className="text-muted-foreground">
                    {invitation.acceptedAt
                      ? t("مقبولة", "Accepted")
                      : invitation.expiresAt < new Date()
                        ? t("منتهية", "Expired")
                        : `${t("بانتظار القبول", "Pending")} · ${roleLabel(invitation.role)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
