import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleDriveConnectionControl } from "@/components/google-drive-connection-control";
import { N8nConnectionControl } from "@/components/n8n-connection-control";
import { OAuthConnectionControl } from "@/components/oauth-connection-control";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import {
  isGoogleDriveConfigured,
  isGoogleDriveConnected,
} from "@/lib/integrations/google-drive/server";
import { getGoogleDriveCallbackFeedback } from "@/lib/integrations/google-drive/callback-feedback";
import {
  INTEGRATION_PROVIDERS,
  PROVIDER_CATEGORIES,
  type IntegrationProvider,
} from "@/lib/integrations/providers";

export const metadata: Metadata = {
  title: "Integrations",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ googleDrive?: string; github?: string; vercel?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const isArabic = lang === "ar";
  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  const { googleDrive, github, vercel } = await searchParams;
  const oauthFeedback = (() => {
    const entries: Array<[string, string | undefined]> = [
      ["GitHub", github],
      ["Vercel", vercel],
    ];
    const active = entries.find(([, value]) => value);
    if (!active) {
      return null;
    }
    const [label, outcome] = active;
    const messages: Record<string, { ar: string; en: string }> = {
      success: {
        ar: `تم ربط ${label} بهذه المساحة. الرموز محفوظة مشفّرة.`,
        en: `${label} is connected to this workspace. Tokens are stored encrypted.`,
      },
      upgrade: {
        ar: `ربط ${label} متاح في الباقات المدفوعة.`,
        en: `Connecting ${label} requires a paid plan.`,
      },
      unavailable: {
        ar: `إعدادات ${label} غير مكتملة على السيرفر.`,
        en: `${label} is not configured on the server.`,
      },
      token_failed: {
        ar: `رفض ${label} تبادل الرمز. أعد المحاولة.`,
        en: `${label} rejected the token exchange. Try again.`,
      },
      storage_failed: {
        ar: `تعذّر حفظ رموز ${label} بأمان.`,
        en: `Could not store the ${label} tokens securely.`,
      },
      error: {
        ar: `لم يكتمل ربط ${label}.`,
        en: `Connecting ${label} did not complete.`,
      },
    };
    const message = messages[outcome ?? "error"] ?? messages.error;
    return {
      isError: outcome !== "success",
      text: isArabic ? message.ar : message.en,
    };
  })();
  const feedback = getGoogleDriveCallbackFeedback(googleDrive, lang);
  const googleDriveConfigured = isGoogleDriveConfigured();
  const googleDriveConnected =
    googleDriveConfigured &&
    (await isGoogleDriveConnected(context.organizationId));
  const providers: IntegrationProvider[] = INTEGRATION_PROVIDERS;
  const googleProviders = new Set(["google_drive", "gmail"]);
  const connectedIds = new Set<string>(
    googleDriveConnected
      ? [...googleProviders].filter((id) => id !== "gmail" || googleDriveConnected)
      : []
  );
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

      {oauthFeedback && (
        <p
          aria-live="polite"
          className="rounded-md border px-4 py-3 text-sm"
          data-testid="oauth-callback-feedback"
          role={oauthFeedback.isError ? "alert" : "status"}
        >
          {oauthFeedback.text}
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
          {entitlements.canConnectIntegrations ? (
            <GoogleDriveConnectionControl
              canManage={canManage}
              configured={googleDriveConfigured}
              connected={googleDriveConnected}
              lang={lang}
            />
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
              <p className="font-medium text-sm">
                {isArabic
                  ? "ربط التكاملات متاح في الباقات المدفوعة"
                  : "Connecting integrations requires a paid plan"}
              </p>
              <p className="text-muted-foreground text-xs">
                {isArabic
                  ? "الباقة المجانية تشمل المحادثة فقط. الباقة الاحترافية تضيف ربط حسابك وتشغيل الوكيل."
                  : "The free plan covers chat only. Pro adds account connections and agent runs."}
              </p>
              <Link
                className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background text-xs"
                href="/pricing"
              >
                {isArabic ? "رقّي الباقة" : "Upgrade plan"}
              </Link>
            </div>
          )}
        </article>
        <article className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium">
              {isArabic ? "سيرفر n8n الخاص بك" : "Your own n8n server"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isArabic
                ? "اربط سيرفر n8n بتاعك برابطه ومفتاح الـAPI، والوكيل يشغّل الـworkflows على البنية التحتية بتاعتك أنت. مفيش أي سيرفر مشترك."
                : "Connect your own n8n instance with its URL and API key. The agent triggers workflows on your own infrastructure; no shared server is involved."}
            </p>
          </div>
          {entitlements.canConnectIntegrations ? (
            <N8nConnectionControl lang={lang} />
          ) : (
            <p className="text-muted-foreground text-xs">
              {isArabic
                ? "متاح في الباقات المدفوعة."
                : "Available on paid plans."}
            </p>
          )}
        </article>
        <article className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium">
              {isArabic ? "GitHub و Vercel" : "GitHub & Vercel"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isArabic
                ? "اربط حسابك على GitHub وVercel بضغطة، ويستخدم الوكيل الرموز المشفّرة لقراءة الكود ومتابعة النشر والنطاقات. لا تُحفظ أي كلمة مرور."
                : "Connect your GitHub and Vercel accounts with one click. The Agent uses the encrypted tokens to read code and follow deploys and domains. No password is ever stored."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OAuthConnectionControl
              canManage={canManage}
              label="GitHub"
              lang={lang}
              provider="github"
            />
            <OAuthConnectionControl
              canManage={canManage}
              label="Vercel"
              lang={lang}
              provider="vercel"
            />
          </div>
        </article>
        {Object.entries(grouped).map(([category, items]) => (
          <div className="flex flex-col gap-3" key={category}>
            <h3 className="font-medium text-sm text-muted-foreground">
              {isArabic
                ? (PROVIDER_CATEGORIES[category]?.ar ?? category)
                : (PROVIDER_CATEGORIES[category]?.en ?? category)}
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
                      {isArabic ? provider.descriptionAr : provider.description}
                    </p>
                    {available && (provider.id === "google_drive" || provider.id === "gmail") ? (
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
