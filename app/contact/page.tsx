import type { Metadata } from "next";
import Link from "next/link";

// The number stays inside the link only: visitors start a WhatsApp chat with
// one tap, but the digits are never rendered on the page.
const WHATSAPP_NUMBER = "971566047579";

export const metadata: Metadata = {
  title: "تواصل معنا — خدمة الشركات B2B",
  description:
    "ZOOKA AI منصة أعمال للشركات (B2B). الاشتراكات مدفوعة وليست مجانية. اسأل عن الباقات والعروض التجارية والفوترة عبر واتساب. ZOOKA AI is a paid B2B platform.",
};

const B2B_POINTS = [
  {
    ar: "مساحات عمل متعددة الفرق والأعضاء بصلاحيات محددة لكل دور.",
    en: "Multiple teams and members with a defined role for every user.",
  },
  {
    ar: "ربط أدوات الشركة: Gmail وDrive وGitHub وVercel وn8n بضغطة.",
    en: "Company tools connected in one click: Gmail, Drive, GitHub, Vercel, n8n.",
  },
  {
    ar: "سجل تدقيق لكل إجراء على التكاملات، وتشفير AES-256-GCM للرموز.",
    en: "An audit trail for every integration action, with AES-256-GCM token encryption.",
  },
  {
    ar: "فوترة رسمية باسم الشركة وعقد اشتراك سنوي عند الطلب.",
    en: "Company invoicing and an annual agreement on request.",
  },
];

export default function ContactPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-16">
      <header className="flex flex-col gap-3 text-center">
        <span className="mx-auto w-fit rounded-full border px-3 py-1 text-muted-foreground text-xs">
          B2B · للأعمال والشركات
        </span>
        <h1 className="font-semibold text-3xl">تواصل مع فريق الأعمال</h1>
        <p className="text-muted-foreground">
          زوكا AI منصة أعمال للشركات — الخدمة مدفوعة وليست مجانية. كل ما
          نقدّمه للاستخدام التجاري يتم عبر باقة اشتراك، والتجربة القصيرة على
          الموقع للتعريف بالمنتج فقط.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border p-6">
        <h2 className="font-semibold text-lg">
          ماذا تشمل خدمة الشركات؟
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {B2B_POINTS.map((point) => (
            <li className="flex gap-2" key={point.en}>
              <span aria-hidden="true" className="text-green-500">
                ✓
              </span>
              <span>{point.ar}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-center gap-4 rounded-xl border bg-muted/30 p-6 text-center">
        <p className="text-muted-foreground text-sm">
          للاستفسار عن الباقات، أو عرض سعر لفريق كامل، أو عقد سنوي وفاتورة
          رسمية — كلّمنا على واتساب وسنرد في أوقات العمل (الأحد إلى الخميس).
        </p>
        <a
          className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground"
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            "مرحبًا، عايز أعرف باقات زوكا AI للشركات (B2B) والتسعير."
          )}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          ابدأ محادثة واتساب
        </a>
        <p className="text-muted-foreground text-xs">
          النموذج مجاني؟ لا. الاشتراك مطلوب للاستخدام التجاري. / Is it free? No.
          A paid plan is required for business use.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link className="underline" href="/pricing">
            اطّلع على الباقات والأسعار
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border p-5 text-sm">
        <h2 className="font-semibold text-base">English</h2>
        <p className="text-muted-foreground">
          ZOOKA AI is a business platform sold to companies as a paid
          subscription — there is no free tier for commercial use. The short
          preview on the website exists only to show the product. Message us on
          WhatsApp for plan details, team pricing, annual agreements and company
          invoicing; we reply during UAE business hours (Sunday to Thursday).
        </p>
      </section>

      <nav className="flex flex-wrap justify-center gap-4 text-muted-foreground text-sm">
        <Link href="/pricing">الأسعار</Link>
        <Link href="/privacy">سياسة الخصوصية</Link>
        <Link href="/terms">شروط الخدمة</Link>
        <Link href="/">الرئيسية</Link>
      </nav>
    </main>
  );
}
