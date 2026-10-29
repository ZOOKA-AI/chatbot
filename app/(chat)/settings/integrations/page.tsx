import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Integrations | Zooka AI",
};

const connectors = {
  ar: [
    {
      name: "Google Drive",
      description: "قراءة الملفات وتلخيصها داخل المحادثة.",
    },
    { name: "Notion", description: "قراءة الصفحات وقواعد البيانات." },
    { name: "Shopify", description: "عرض المنتجات والطلبات الأساسية." },
  ],
  en: [
    {
      name: "Google Drive",
      description: "Read and summarize files in a conversation.",
    },
    { name: "Notion", description: "Read pages and databases." },
    { name: "Shopify", description: "View products and basic order details." },
  ],
} as const;

export default async function IntegrationsPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const isArabic = lang === "ar";

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
            ? "اربط أدوات فريقك ليتمكن الوكيل من استخدامها في المحادثات."
            : "Connect your team's tools so the Agent can use them in conversations."}
        </p>
      </header>

      <section
        aria-label={isArabic ? "التكاملات المتاحة" : "Available integrations"}
        className="grid gap-4"
      >
        {connectors[lang].map((connector) => (
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
              {isArabic ? "قريباً" : "Coming soon"}
            </span>
          </article>
        ))}
      </section>

      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        {isArabic
          ? "الاتصالات غير مفعّلة حالياً. لا نطلب أو نخزّن بيانات اعتماد خارجية ولا نصل إلى بيانات هذه الخدمات."
          : "Connections are not enabled yet. We do not request or store external credentials or access data from these services."}
      </p>
    </main>
  );
}
