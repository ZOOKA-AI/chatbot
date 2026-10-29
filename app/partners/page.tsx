import type { Metadata } from "next";
import Link from "next/link";

const WHATSAPP = "971566047579";

export const metadata: Metadata = {
  title: "شركاء ZOOKA AI — موزّعون، وكلاء، وامتياز",
  description:
    "انضم إلى شبكة شركاء ZOOKA AI: عمولة 20% للموزّعين، حسابات white-label للوكلاء، وامتياز تشغيل كامل باسم منطقتك. Join the ZOOKA AI partner, reseller and franchise network.",
  alternates: { canonical: "/partners" },
};

const tracks = [
  {
    tag: "01",
    title: "موزّع / مسوّق بالعمولة",
    price: "بدون رسوم دخول",
    points: [
      "عمولة 20% متكررة على كل اشتراك مدفوع يجي من رابطك",
      "رابط تتبّع جاهز: zooka-ai.com/r/CODE",
      "تتبّع النقرات والاشتراكات في لوحة الشركاء",
      "مناسب لمن عنده جمهور أو عملاء خدمات رقمية",
    ],
    cta: "اطلب كود الشريك",
    msg: "أبغى أنضم كموزّع بالعمولة في ZOOKA AI",
  },
  {
    tag: "02",
    title: "وكيل / White-label",
    price: "رسوم تشغيل + شهري",
    points: [
      "شات بوت باسمك على نطاقك أو نطاق فرعي",
      "لوحة تحكم لعملائك مع حدود رسائل لكل حساب",
      "دعم فني منّا بالخلفية وتحديثات مستمرة",
      "مناسب لوكالات التسويق وشركات البرمجة",
    ],
    cta: "كلّمنا عن الوكالة",
    msg: "مهتم بشراكة White-label مع ZOOKA AI",
  },
  {
    tag: "03",
    title: "امتياز منطقة (Franchise)",
    price: "حق امتياز لمرة واحدة",
    points: [
      "تشغيل ZOOKA AI باسم منطقتك أو مدينتك",
      "تدريب فريقك على البيع والتشغيل والتسعير",
      "مساعدة في أول 20 عميل وأول حملة إعلانية",
      "أولوية في التطوير والخصائص المطلوبة",
    ],
    cta: "اطلب ملف الامتياز",
    msg: "أبغى ملف امتياز ZOOKA AI لمنطقتي",
  },
];

export default function PartnersPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16" dir="rtl">
      <header className="flex flex-col gap-4 text-center">
        <p className="text-sm text-muted-foreground">ZOOKA AI — شريك</p>
        <h1 className="font-semibold text-4xl leading-tight">
          اكسب مع ZOOKA AI عِبر ثلاث مسارات
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          شات بوت عربي مدعوم بموديلات متعددة، يبني مساعد ذكي لموقعك في دقائق. اختر
          الطريق المناسب لك: عمولة على الاشتراكات، أو وكالة باسمك، أو امتياز منطقة
          كاملة.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        {tracks.map((t) => (
          <article
            key={t.tag}
            className="flex flex-col gap-4 rounded-2xl border p-6 shadow-sm"
          >
            <span className="text-xs text-muted-foreground">{t.tag}</span>
            <h2 className="font-semibold text-xl">{t.title}</h2>
            <p className="text-sm font-medium">{t.price}</p>
            <ul className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
              {t.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <a
              className="rounded-lg bg-primary px-4 py-2 text-center text-primary-foreground"
              href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(t.msg)}`}
              rel="noreferrer"
              target="_blank"
            >
              {t.cta}
            </a>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border bg-muted/30 p-6">
        <h2 className="font-semibold text-2xl">كيف تبدأ؟</h2>
        <ol className="mt-4 flex list-decimal flex-col gap-3 ps-6 text-muted-foreground">
          <li>كلّمنا على واتساب واختر المسار (موزّع، وكيل، امتياز).</li>
          <li>نفتح لك كود شريك أو حساب white-label خلال يوم عمل.</li>
          <li>تستلم مواد البيع والتسعير وقالب الرسائل للعملاء.</li>
          <li>تبدأ تستقبل اشتراكات، والعمولة أو الفاتورة تتسجل في لوحة الشركاء.</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-lg border px-4 py-2"
            href="/partners/join"
          >
            طلب انضمام
          </Link>
          <Link className="rounded-lg border px-4 py-2" href="/pricing">
            الأسعار
          </Link>
        </div>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        الشراكات تشمل الالتزام بشروط الاستخدام وسياسة الإعلان.<br />
        <Link className="underline" href="/terms">شروط الاستخدام</Link>
        {" · "}
        <Link className="underline" href="/privacy">سياسة الخصوصية</Link>
      </p>
    </main>
  );
}
