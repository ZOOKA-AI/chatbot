import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleDriveConnectionControl } from "@/components/google-drive-connection-control";
import { N8nConnectionControl } from "@/components/n8n-connection-control";
import { OAuthConnectionControl } from "@/components/oauth-connection-control";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { getGoogleDriveCallbackFeedback } from "@/lib/integrations/google-drive/callback-feedback";
import { isGoogleDriveConfigured, isGoogleDriveConnected } from "@/lib/integrations/google-drive/server";
import { getLiveIntegrationStatus } from "@/lib/integrations/live-status";
import { isOAuthProviderConfigured } from "@/lib/integrations/oauth/config";
import {
  getIntegrationProviders,
  isWhatsAppConfigured,
  type IntegrationProvider,
  PROVIDER_CATEGORIES,
} from "@/lib/integrations/providers";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

export const metadata: Metadata = {
  title: "Integrations",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    googleDrive?: string;
    github?: string;
    vercel?: string;
    x?: string;
  }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const isArabic = lang === "ar";
  const entitlements = await getWorkspaceEntitlements(context.organizationId);
  const { googleDrive, github, vercel, x } = await searchParams;
  const oauthFeedback = (() => {
    const entries: [string, string | undefined][] = [
      ["GitHub", github],
      ["Vercel", vercel],
      ["X", x],
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
  const xConfigured = isOAuthProviderConfigured("x");
  // One source of truth shared with /api/integrations/status: a badge reads
  // "connected" only when the stored credential works right now.
  const liveStatus = await getLiveIntegrationStatus(context.organizationId, {
    googleConfigured: googleDriveConfigured,
  });
  const connectedIds = liveStatus.connected;
  const needsReconnectIds = liveStatus.needsReconnect;
  const googleDriveConnected = googleDriveConfigured && await isGoogleDriveConnected(context.organizationId);
  const googleNeedsReconnect = ["google_drive", "gmail", "google_calendar"].some(
    (id) => needsReconnectIds.has(id)
  );
  const providers: IntegrationProvider[] = getIntegrationProviders(
    isWhatsAppConfigured(process.env)
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
      <Link className="rounded-lg border p-3 text-sm underline" href="/integration-hub">Integration Hub — اختبر الاتصال الفعلي / Test actual connection</Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {isArabic ? "التكاملات" : "Integrations"}
        </h1>
        <p className="text-muted-foreground text-sm">
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
            <p className="text-muted-foreground text-sm">
              {isArabic
                ? "البحث عن ملفات Google Docs والنصوص وقراءتها. لا يمكن للوكيل تعديل الملفات."
                : "Search and read Google Docs and text files. The Agent cannot modify files."}
            </p>
            <p className="text-muted-foreground text-xs">
              {isArabic
                ? "تُحفظ الرموز مشفّرة ومقيّدة بمساحة العمل. يُرسل نص الملف المقروء إلى النموذج ويُحفظ ضمن المحادثة."
                : "Tokens are encrypted and scoped to this workspace. Read file text is sent to the model and saved with the chat."}
            </p>
            {googleNeedsReconnect ? (
              <p
                className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300"
                role="status"
              >
                {isArabic
                  ? "صلاحيات Google المحفوظة لم تعد تعمل، لذلك لا يستطيع الوكيل قراءة Gmail أو Drive أو التقويم. اضغط «تحديث صلاحيات Gmail والتقويم» ووافق على كل الصلاحيات."
                  : "The saved Google permission no longer works, so the Agent cannot read Gmail, Drive or Calendar. Use “Update Gmail and Calendar permissions” and approve every permission."}
              </p>
            ) : null}
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
              <p className="text-sm font-medium">
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
                className="bg-foreground text-background rounded-md px-3 py-1.5 text-xs font-medium"
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
                ? "اربط GitHub وVercel مرة واحدة؛ يرتبط الحساب بضغطة عبر OAuth أو بتوكن وصول شخصي (BYOK). يحفظ النظام التوكن مشفّرًا بـAES-256-GCM ولا تُحفظ أي كلمة مرور، ويمكن فصل الحساب في أي وقت فيُحذف التوكن."
                : "Connect GitHub and Vercel once, either with one-click OAuth or a personal access token (BYOK). Tokens are stored with AES-256-GCM encryption, no password is ever saved, and disconnecting deletes the token."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OAuthConnectionControl
              canManage={canManage}
              label="GitHub"
              lang={lang}
              provider="github"
              tokenHint="ghp_… / github_pat_…"
            />
            <OAuthConnectionControl
              canManage={canManage}
              label="Vercel"
              lang={lang}
              provider="vercel"
              tokenHint="Vercel access token"
            />
          </div>
        </article>
        {Object.entries(grouped).map(([category, items]) => (
          <div className="flex flex-col gap-3" key={category}>
            <h3 className="text-muted-foreground text-sm font-medium">
              {isArabic
                ? (PROVIDER_CATEGORIES[category]?.ar ?? category)
                : (PROVIDER_CATEGORIES[category]?.en ?? category)}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((provider) => {
                const configured = provider.id !== "x" || xConfigured;
                const connected =
                  connectedIds.has(provider.id) && configured;
                const needsReconnect =
                  needsReconnectIds.has(provider.id) && configured;
                const available = provider.status === "available";
                return (
                  <article
                    className="flex flex-col gap-2 rounded-lg border p-4"
                    data-provider={provider.id}
                    key={provider.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-medium">
                        {isArabic ? provider.nameAr : provider.name}
                      </h4>
                      <span
                        className={
                          connected
                            ? "shrink-0 rounded-full border border-emerald-600/40 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"
                            : needsReconnect
                              ? "shrink-0 rounded-full border border-amber-500/50 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
                        }
                      >
                        {connected
                          ? isArabic
                            ? "متصل"
                            : "Connected"
                          : needsReconnect
                            ? isArabic
                              ? "يحتاج إعادة ربط"
                              : "Reconnect needed"
                            : available && configured
                              ? provider.id === "whatsapp"
                                ? isArabic
                                  ? "مهيأ على الخادم"
                                  : "Server configured"
                                : isArabic
                                  ? "ربط ذاتي"
                                  : "Self-serve"
                            : provider.id === "x"
                              ? isArabic
                                ? "غير مُعدّ"
                                : "Not configured"
                              : provider.status === "beta"
                                ? isArabic
                                  ? "عبر الوكيل"
                                  : "Via agent"
                                : isArabic
                                  ? "قريبًا"
                                  : "Coming soon"}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {isArabic ? provider.descriptionAr : provider.description}
                    </p>
                    {provider.id === "google_calendar" &&
                    !connected &&
                    canManage &&
                    googleDriveConfigured ? (
                      <Link
                        className="text-xs underline"
                        href="/api/integrations/google-drive/connect"
                      >
                        {isArabic
                          ? "ربط التقويم عبر موافقة Google المشتركة"
                          : "Connect Calendar via shared Google consent"}
                      </Link>
                    ) : null}
                    {provider.id === "x" ? (
                      <OAuthConnectionControl
                        allowToken={false}
                        canManage={canManage}
                        label="X"
                        lang={lang}
                        provider="x"
                        tokenHint=""
                      />
                    ) : null}
                    {available &&
                    (provider.id === "google_drive" ||
                      provider.id === "gmail") ? (
                      <p className="text-muted-foreground text-[11px]">
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

      <p className="bg-muted text-muted-foreground rounded-md p-4 text-sm">
        {isArabic
          ? "لا يظهر Google Drive وGmail كمتصلين إلا بعد موافقة OAuth وتخزين الرموز مشفّرة لمساحة العمل. البحث والقراءة والإرسال متاحة للوكيل."
          : "Google Drive and Gmail are shown as connected only after OAuth succeeds and tokens are encrypted for this workspace. The Agent can search, read and send from Gmail."}
      </p>
    </main>
  );
}
