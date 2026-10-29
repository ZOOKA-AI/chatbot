import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleDriveConnectionControl } from "@/components/google-drive-connection-control";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import {
  isGoogleDriveConfigured,
  isGoogleDriveConnected,
} from "@/lib/integrations/google-drive/server";
import { getGoogleDriveCallbackFeedback } from "@/lib/integrations/google-drive/callback-feedback";

export const metadata: Metadata = {
  title: "Integrations | Zooka AI",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ googleDrive?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const isArabic = lang === "ar";
  const { googleDrive } = await searchParams;
  const feedback = getGoogleDriveCallbackFeedback(googleDrive, lang);
  const googleDriveConfigured = isGoogleDriveConfigured();
  const googleDriveConnected =
    googleDriveConfigured &&
    (await isGoogleDriveConnected(context.organizationId));
  const canManage =
    context.user.type === "regular" &&
    ["owner", "admin"].includes(context.role);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">
          {isArabic ? "التكاملات" : "Integrations"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? "يستخدم الوكيل Google Drive للقراءة فقط عند تفعيل الاتصال في مساحة العمل. لا تتوفر تكاملات Notion وShopify."
            : "The Agent can use Google Drive read-only when connected to this workspace. Notion and Shopify are unavailable."}
        </p>
      </header>

      {feedback && (
        <p
          aria-live="polite"
          className="rounded-md border px-4 py-3 text-sm"
          data-testid="google-drive-callback-feedback"
          role={
            googleDrive === "error" || googleDrive === "unavailable"
              ? "alert"
              : "status"
          }
        >
          {feedback}
        </p>
      )}

      <section
        aria-label={isArabic ? "حالة التكاملات" : "Integration status"}
        className="grid gap-4"
      >
        <article className="flex items-center justify-between gap-4 rounded-lg border p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium">Google Drive</h2>
            <p className="text-sm text-muted-foreground">
              {isArabic
                ? "البحث عن ملفات Google Docs والنصوص وقراءتها. لا يمكن للوكيل تعديل الملفات."
                : "Search and read Google Docs and text files. The Agent cannot modify files."}
            </p>
            <p className="text-xs text-muted-foreground">
              {isArabic
                ? "تُحفظ الرموز مشفّرة ومقيّدة بمساحة العمل. يُرسل نص الملف المقروء إلى النموذج ويُحفظ ضمن المحادثة."
                : "Tokens are encrypted and scoped to this workspace. Read file text is sent to the model and saved with the chat."}
            </p>
          </div>
          <GoogleDriveConnectionControl
            canManage={canManage}
            configured={googleDriveConfigured}
            connected={googleDriveConnected}
            lang={lang}
          />
        </article>
        {[
          {
            name: "Notion",
            description: isArabic
              ? "غير متاح؛ لا يستطيع الوكيل الوصول إلى صفحات Notion."
              : "Unavailable; the Agent cannot access Notion pages.",
          },
          {
            name: "Shopify",
            description: isArabic
              ? "غير متاح؛ لا يستطيع الوكيل الوصول إلى بيانات Shopify."
              : "Unavailable; the Agent cannot access Shopify data.",
          },
        ].map((connector) => (
          <article
            className="flex items-center justify-between gap-4 rounded-lg border p-5"
            key={connector.name}
          >
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">{connector.name}</h2>
              <p className="text-sm text-muted-foreground">
                {connector.description}
              </p>
            </div>
            <span className="shrink-0 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              {isArabic ? "غير متاح" : "Unavailable"}
            </span>
          </article>
        ))}
      </section>

      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        {isArabic
          ? "لا يظهر Google Drive كمتصل إلا بعد موافقة OAuth وتخزين الرموز مشفّرة لمساحة العمل. البحث والقراءة فقط متاحان للوكيل."
          : "Google Drive is shown as connected only after OAuth succeeds and tokens are encrypted for this workspace. Agent access is read-only."}
      </p>
    </main>
  );
}
