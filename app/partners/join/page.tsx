import type { Metadata } from "next";
import Link from "next/link";

const WHATSAPP = "971566047579";

export const metadata: Metadata = {
  title: "طلب انضمام لشبكة شركاء ZOOKA AI",
  description:
    "املأ بياناتك وأرسلها بضغطة واحدة على واتساب، ونرد عليك خلال يوم عمل بمسار الشراكة المناسب: موزّع، وكيل white-label، أو امتياز منطقة.",
  alternates: { canonical: "/partners/join" },
};

const options = [
  "موزّع بالعمولة (20% على الاشتراكات)",
  "وكيل / White-label باسم شركتي",
  "امتياز منطقة (Franchise)",
  "مشترك عادي على إحدى الباقات",
];

export default function PartnerJoinPage() {
  const message = encodeURIComponent(
    "طلب انضمام لشبكة شركاء ZOOKA AI\n\nالاسم:\nالشركة/النشاط:\nالمدينة والبلد:\nالمسار المطلوب:\nعدد العملاء المتوقع في أول 3 شهور:\nرقم التواصل:"
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16" dir="rtl">
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl">طلب انضمام</h1>
        <p className="text-muted-foreground">
          نرسل لك استمارة قصيرة على واتساب، تملأها وتعيدها، ونرد عليك بمسار الشراكة
          ونسب العمولة أو سعر الامتياز خلال يوم عمل.
        </p>
      </header>

      <section className="rounded-2xl border p-6">
        <h2 className="font-semibold text-lg">المسارات المتاحة</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
          {options.map((o) => (
            <li key={o} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-6">
        <h2 className="font-semibold text-lg">بيانات مطلوبة</h2>
        <p className="text-sm text-muted-foreground">
          الاسم، الشركة أو النشاط، المدينة والبلد، المسار المطلوب، عدد العملاء المتوقع
          في أول ثلاثة شهور، ورقم التواصل.
        </p>
        <a
          className="rounded-lg bg-primary px-4 py-3 text-center text-primary-foreground"
          href={`https://wa.me/${WHATSAPP}?text=${message}`}
          rel="noreferrer"
          target="_blank"
        >
          أرسل الطلب على واتساب
        </a>
        <p className="text-xs text-muted-foreground">
          الاتصال عبر واتساب فقط، ولا نستقبل مكالمات على هذا الرقم.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        عرفت الشروط؟{" "}
        <Link className="underline" href="/partners">
          راجع مسارات الشراكة
        </Link>{" "}
        أو{" "}
        <Link className="underline" href="/pricing">
          الأسعار
        </Link>
        .
      </p>
    </main>
  );
}
