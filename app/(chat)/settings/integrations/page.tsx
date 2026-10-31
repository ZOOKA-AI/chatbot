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
import {
  listProviderCatalog,
  listWorkspaceIntegrations,
  type IntegrationProvider,
} from "@/lib/integrations/catalog";

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
  let providers: IntegrationProvider[] = [];
  let connectedIds = new Set<string>();
  try {
    providers = await listProviderCatalog();
    const connections = await listWorkspaceIntegrations(context.organizationId);
    connectedIds = new Set(
      connections
        .filter((connection) => connection.status === "connected")
        .map((connection) => connection.providerId)
    );
  } catch {
    providers = [];
  }
  const categoryLabels: Record<string, string> = {
    communication: "التواصل",
    social: "التواصل الاجتماعي",
    ads: "الإعلانات",
    dev: "التطوير",
    storage: "التخزين",
    productivity: "الإنتاجية",
    finance: "المالية",
    travel: "السفر",
    automation: "الأتمتة",
    geo: "الخرائط",
    listing: "الملف التجاري",
    commerce: "المتاجر",
  };
  const grouped = providers.reduce<Record<string, IntegrationProvider[]>>(
    (accumulator, provider) => {
      accumulator[provider.category] = [
        ...(accumulator[provider.category] ?? []),
        provider,
      ];
      return accumulator;
    },
    {}
  );

  const canManage =
    context.user.type === "regular" &&
    ["owner", "admin"].includes(context.role);

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
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
            ? "يستخدم الوكيل Google Drive للقراءة، وGmail للبحث والقراءة والإرسال عند تفعيل الاتصال في مساحة العمل. لا تتوفر تكاملات Notion وShopify."
            : "The Agent can use Google Drive read-only, and Gmail to search, read and send, when connected to this workspace. Notion and Shopify are unavailable."}
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
            <h2 className="font-medium">Google Drive &amp; Gmail</h2>
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
        {Object.entries(grouped).map(([category, items]) => (
          <div className="flex flex-col gap-3" key={category}>
            <h3 className="font-medium text-sm text-muted-foreground">
              {isArabic
                ? (categoryLabels[category] ?? category)
                : category[0].toUpperCase() + category.slice(1)}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((provider) => {
                const connected = connectedIds.has(provider.id);
                const available = provider.status === "available";
                return (
                  <article
                    className="flex flex-col gap-2 rounded-lg border p-4"
                    data-provider={provider.id}
                    key={provider.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm">
                        {isArabic ? provider.nameAr : provider.name}
                      </h4>
                      <span
                        className={
                          connected
                            ? "shrink-0 rounded-full border border-emerald-600/40 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"
                            : "shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                        }
                      >
                        {connected
                          ? isArabic
                            ? "متصل"
                            : "Connected"
                          : available
                            ? isArabic
                              ? "متاح"
                              : "Available"
                            : isArabic
                              ? "قريبًا"
                              : "Coming soon"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isArabic
                        ? (provider.descriptionAr ?? provider.description ?? "")
                        : (provider.description ?? "")}
                    </p>
                    {provider.isManaged && available ? (
                      <p className="text-[11px] text-muted-foreground">
                        {isArabic
                          ? "ربط بضغطة: الوكيل يفتح صفحة الموافقة بنفسه ولا تحتاج مفتاحًا."
                          : "One-click: the Agent opens the consent screen, no API key needed."}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        {isArabic
          ? "لا يظهر Google Drive وGmail كمتصلين إلا بعد موافقة OAuth وتخزين الرموز مشفّرة لمساحة العمل. البحث والقراءة والإرسال متاحة للوكيل."
          : "Google Drive and Gmail are shown as connected only after OAuth succeeds and tokens are encrypted for this workspace. The Agent can search, read and send from Gmail."}
      </p>
    </main>
  );
}
