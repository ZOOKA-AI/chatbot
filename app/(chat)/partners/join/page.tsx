import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "طلب انضمام | Join",
  description:
    "قدّم طلب انضمام لشبكة شركاء Zooka AI: عمولة على الاشتراكات، وكالة white-label، أو امتياز منطقة. Apply to the Zooka AI partner network.",
};

const WHATSAPP = "971566047579";

export default async function PartnerJoinPage() {
  const lang = await getLang();
  const isAr = lang === "ar";

  const tracks = isAr
    ? [
        "موزّع بالعمولة: 20% على الاشتراكات المؤهلة",
        "وكيل / White-label: الشات باسم شركتك على نطاقك",
        "امتياز منطقة: تشغيل كامل باسم منطقتك",
      ]
    : [
        "Affiliate: 20% recurring on eligible subscriptions",
        "White-label agent: the bot under your brand and domain",
        "Franchise: full operation for your city or region",
      ];

  const message = encodeURIComponent(
    isAr
      ? "طلب انضمام لشبكة شركاء ZOOKA AI\n\nالاسم:\nالشركة أو النشاط:\nالمدينة والبلد:\nالمسار المطلوب (موزّع / وكيل / امتياز):\nعدد العملاء المتوقع في أول 3 شهور:\nرقم التواصل:"
      : "Zooka AI partner application\n\nName:\nCompany or business:\nCity and country:\nTrack (affiliate / white-label / franchise):\nExpected clients in first 3 months:\nContact number:"
  );

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <div className="absolute end-4 top-4 z-10">
        <LanguageToggle lang={lang} />
      </div>

      <header className="text-center">
        <p className="font-medium text-primary text-sm">
          {isAr ? "شبكة الشركاء" : "Partner Network"}
        </p>
        <h1 className="mt-2 font-bold text-4xl md:text-5xl">
          {isAr ? "طلب انضمام" : "Apply to join"}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          {isAr
            ? "أرسل بياناتك على واتساب بضغطة واحدة، ونرد عليك بمسار الشراكة والعمولة أو سعر الامتياز خلال يوم عمل."
            : "Send your details on WhatsApp in one tap; we reply with the partner track, commission rate or franchise price within one business day."}
        </p>
      </header>

      <section className="rounded-2xl border p-6">
        <h2 className="font-semibold text-xl">
          {isAr ? "المسارات المتاحة" : "Available tracks"}
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
          {tracks.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-center gap-4 rounded-2xl border bg-muted/30 p-6">
        <a
          className="w-full rounded-lg bg-primary px-6 py-3 text-center font-medium text-primary-foreground"
          href={`https://wa.me/${WHATSAPP}?text=${message}`}
          rel="noreferrer"
          target="_blank"
        >
          {isAr ? "أرسل الطلب على واتساب" : "Send the request on WhatsApp"}
        </a>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "الدعم عبر واتساب فقط، ولا نستقبل مكالمات على هذا الرقم."
            : "Support is WhatsApp only; no calls are received on this number."}
        </p>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        <Link className="underline" href="/partners">
          {isAr ? "برنامج الشراكة" : "Partner program"}
        </Link>
        {" · "}
        <Link className="underline" href="/pricing">
          {isAr ? "الأسعار" : "Pricing"}
        </Link>
        {" · "}
        <Link className="underline" href="/terms">
          {isAr ? "شروط الاستخدام" : "Terms"}
        </Link>
      </p>
    </main>
  );
}
