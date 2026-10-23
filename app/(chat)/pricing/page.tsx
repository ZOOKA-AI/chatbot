import Link from "next/link";
import { PricingCheckoutButton } from "@/components/pricing-checkout-button";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { getStripePriceId, workspacePlans } from "@/lib/saas/plans";

const pricingPlanKeys = ["free", "pro", "business"] as const;

const strings = {
  ar: {
    eyebrow: "باقات بسيطة وواضحة",
    title: "اختر الباقة المناسبة لعملك",
    subtitle: "ابدأ مجاناً وارتقِ وقت ما تحتاج فريقك.",
    canceled: "تم إلغاء الدفع. لم يتم أي تغيير على حسابك.",
    plans: {
      free: { name: "المجانية", features: ["1,000 رسالة شهرياً", "نماذج قياسية"] },
      pro: { name: "الاحترافية", features: ["10,000 رسالة شهرياً", "نماذج متقدمة"] },
      business: {
        name: "الأعمال",
        features: ["100,000 رسالة شهرياً", "مساحات عمل للفرق", "دعم بأولوية"],
      },
    },
    perMonth: " / شهرياً",
    messagesPerMonth: "رسالة شهرياً",
    upgradeTo: "الترقية إلى",
    startFree: "ابدأ مجاناً",
    privacy: "سياسة الخصوصية",
    terms: "شروط الخدمة",
  },
  en: {
    eyebrow: "Simple, transparent plans",
    title: "Choose the right workspace plan",
    subtitle: "Start for free and upgrade whenever your team needs more.",
    canceled: "Checkout was canceled. No changes were made.",
    plans: {
      free: { name: "Free", features: ["1,000 messages per month", "Standard models"] },
      pro: { name: "Pro", features: ["10,000 messages per month", "Advanced models"] },
      business: {
        name: "Business",
        features: ["100,000 messages per month", "Team workspaces", "Priority support"],
      },
    },
    perMonth: " / month",
    messagesPerMonth: "messages per month",
    upgradeTo: "Upgrade to",
    startFree: "Start for free",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
  },
} as const;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { canceled } = await searchParams;
  const lang = await getLang();
  const t = strings[lang];

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-10 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <div className="absolute top-4 end-4 z-10">
        <LanguageToggle lang={lang} />
      </div>
      <header className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground text-sm">{t.eyebrow}</p>
        <h1 className="font-semibold text-4xl">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </header>

      {canceled && (
        <p className="text-center text-sm text-muted-foreground">{t.canceled}</p>
      )}

      <section className="grid gap-5 md:grid-cols-3">
        {pricingPlanKeys.map((planKey) => {
          const plan = workspacePlans[planKey];
          const isPaid = planKey !== "free";
          const setupMessage =
            planKey === "free"
              ? undefined
              : process.env.STRIPE_SECRET_KEY
                ? getStripePriceId(planKey)
                  ? undefined
                  : `Billing setup required: configure STRIPE_PRICE_${planKey.toUpperCase()} with its Stripe Price ID.`
                : "Billing setup required: configure STRIPE_SECRET_KEY.";
          return (
            <article
              className="flex flex-col gap-6 rounded-xl border p-6"
              key={planKey}
            >
              <div className="flex flex-col gap-2">
                <h2 className="font-semibold text-xl">{t.plans[planKey].name}</h2>
                <p className="text-3xl font-semibold">
                  ${plan.price}
                  <span className="font-normal text-base text-muted-foreground">
                    {plan.price ? t.perMonth : ""}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {plan.monthlyMessages.toLocaleString()} {t.messagesPerMonth}
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-3 text-sm">
                {t.plans[planKey].features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
              {isPaid ? (
                <PricingCheckoutButton
                  label={`${t.upgradeTo} ${t.plans[planKey].name}`}
                  plan={planKey}
                  setupMessage={setupMessage}
                />
              ) : (
                <Link
                  className="w-full rounded-md border px-4 py-2 text-center font-medium"
                  href="/"
                >
                  {t.startFree}
                </Link>
              )}
            </article>
          );
        })}
      </section>

      <footer className="text-muted-foreground mx-auto flex gap-4 text-sm">
        <Link className="hover:underline" href="/privacy">
          {t.privacy}
        </Link>
        <Link className="hover:underline" href="/terms">
          {t.terms}
        </Link>
      </footer>
    </main>
  );
}
