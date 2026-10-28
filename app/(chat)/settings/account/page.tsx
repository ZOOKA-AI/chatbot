import { redirect } from "next/navigation";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang } from "@/lib/i18n";

export default async function AccountSettingsPage() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
    redirect("/login");
  }
  const lang = await getLang();
  const ar = lang === "ar";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6" dir={ar ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">
          {ar ? "إعدادات الحساب" : "Account settings"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar ? "إدارة بيانات حسابك وخصوصيتك." : "Manage your account data and privacy."}
        </p>
      </header>
      <section className="flex flex-col gap-4 rounded-lg border border-destructive/40 p-5">
        <h2 className="font-medium text-lg">
          {ar ? "حذف الحساب والبيانات" : "Delete account and data"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {ar
            ? "يحذف هذا الإجراء حسابك ومحادثاتك وملفاتك وبيانات الاستخدام من جميع مساحات العمل. لحماية فريقك، انقل ملكية المساحات التي تضم أعضاء آخرين أولاً، وألغِ أي اشتراك نشط."
            : "This removes your account, chats, files, and usage data across workspaces. To protect your team, transfer ownership of workspaces with other members and cancel active subscriptions first."}
        </p>
        <DeleteAccountButton lang={lang} />
      </section>
    </main>
  );
}
