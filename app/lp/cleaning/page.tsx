import type { Metadata } from "next";

const WHATSAPP = "971566047579";
const WA_LINK = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
  "مرحبا، أبغى أعرف أكثر عن ZOOKA AI لشركة التنظيف عندي"
)}`;

export const metadata: Metadata = {
  title: "ZOOKA AI لشركات التنظيف | مساعد يرد على العملاء ويكتب المحتوى",
  description:
    "مساعد ذكاء اصطناعي بالعربي لشركات التنظيف وخدمات المنازل في الإمارات: يرد على استفسارات العملاء، يجهز عروض الأسعار، ويكتب محتوى إنستجرام يوميا.",
  alternates: { canonical: "https://zooka-ai.com/lp/cleaning" },
};

const pains = [
  "عميل يسأل عن السعر الساعة ٢ بالليل، يرجع الصبح ويلاقي المنافس رد قبلك.",
  "منشورات إنستجرام متأخرة أو ناقصة لأن حد مشغول بالشغل نفسه.",
  "نفس الأسئلة تتكرر كل يوم: كم السعر؟ تغطون منطقتي؟ عندكم فاتورة؟",
];

const jobs = [
  {
    title: "ردود فورية بالعربي والإنجليزي",
    body: "زميلك اللي بيفهم شغلك: يعرف خدماتك وأسعارك، يرد على العميل بنفس نبرة شركتك، ويحوّل الحالات الخاصة لك باختصار.",
  },
  {
    title: "عروض أسعار ورسائل جاهزة",
    body: "اكتب: «عرض سعر تنظيف فيلا ٣ غرف في دبي مارينا» وخذ رسالة مرتبة بالخدمات والسعر والمدة جاهزة للإرسال.",
  },
  {
    title: "محتوى يومي بدون مصور",
    body: "أفكار منشورات وكابشن عربي قصير لكل خدمة من خدماتك، مع هاشتاقات محلية، بدل ما تقعد تفكر كل يوم.",
  },
];

const steps = [
  "افتح حساب وابدأ باقة مجانية (رسائل تجريبية بدون بطاقة).",
  "أضف خدماتك وأسعارك في دقائق داخل المحادثة.",
  "اسأل مثل عميلك، وطلّع رسالة جاهزة للإرسال وانسخها على واتساب.",
];

const faqs = [
  {
    q: "هل يشتغل بالعربي الخليجي؟",
    a: "نعم، يرد بالفصحى أو باللهجة الخليجية حسب أسلوب العميل، ويكتب محتوى عربي طبيعي غير مترجم.",
  },
  {
    q: "هل يتصل بواتساب مباشرة؟",
    a: "اليوم تنسخ الرد وترسله بنفسك، والقناة على واتساب قادمة. لا نطلب منك كلمة سر واتساب ولا نتحكم بحسابك.",
  },
  {
    q: "هل بيانات شركتي معزولة؟",
    a: "كل مساحة عمل منفصلة بصلاحياتها، ولا تُستخدم محادثاتك لتدريب نماذج عامة.",
  },
  {
    q: "كم التكلفة؟",
    a: "باقة مجانية للتجربة، ثم 19 دولار شهريا للاحترافية و49 دولار للأعمال. بدون ارتباط سنوي.",
  },
];

export default function CleaningLandingPage() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-12 p-6 py-12"
      dir="rtl"
      lang="ar"
    >
      <section className="flex flex-col gap-5">
        <p className="w-fit rounded-full border px-3 py-1 text-muted-foreground text-xs">
          ZOOKA AI — مساعد أعمال بالعربي لشركات التنظيف في الإمارات
        </p>
        <h1 className="font-semibold text-3xl leading-snug md:text-4xl">
          رد على عميلك في ثانية، وطلّع محتوى إنستجرامك كل يوم
          <span className="text-muted-foreground"> — بدون توظيف حد إضافي.</span>
        </h1>
        <p className="text-muted-foreground">
          مساعد واحد يفهم خدمات التنظيف وأسعارك، يرد على الاستفسارات المتكررة،
          يجهّز عروض الأسعار، ويكتب كابشن عربي قصير لكل خدمة. تجربه من المتصفح،
          بدون تركيب أي شيء.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            className="rounded-md bg-primary px-5 py-3 text-center font-medium text-primary-foreground"
            href={WA_LINK}
            rel="noopener noreferrer"
            target="_blank"
          >
            اسأل على واتساب
          </a>
          <a
            className="rounded-md border px-5 py-3 text-center font-medium"
            href="https://zooka-ai.com/pricing"
          >
            شوف الأسعار
          </a>
        </div>
        <p className="text-muted-foreground text-xs">
          الدعم عبر واتساب فقط. بدون بطاقة في البداية.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">مشاكل تعرفها كل يوم</h2>
        <ul className="flex flex-col gap-3">
          {pains.map((item) => (
            <li className="flex gap-3 rounded-xl border p-4 text-sm" key={item}>
              <span className="text-muted-foreground">—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">إيش بيسوي لك بالضبط</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {jobs.map((job) => (
            <article className="flex flex-col gap-2 rounded-xl border p-4" key={job.title}>
              <h3 className="font-semibold text-base">{job.title}</h3>
              <p className="text-muted-foreground text-sm">{job.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">مثال حقيقي من شغل التنظيف</h2>
        <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
          <p className="text-muted-foreground">
            العميل: «تنظيف شقة غرفتين في الشارقة، كم السعر وعندكم فاتورة؟»
          </p>
          <p>
            الرد الجاهز: «أهلاً وسهلاً. تنظيف شقة غرفتين وصالة يبدأ من ٢٥٠ درهم،
            يشمل الحمام والمطبخ والغبار. المدة ٣ إلى ٤ ساعات، وفريقنا يغطي
            الشارقة اليوم. نعم نصدر فاتورة ضريبية باسم شركتك. تحب نحجز لك
            بكرة الصبح؟»
          </p>
          <p className="text-muted-foreground text-xs">
            تعدّل السعر والمدة مرة واحدة، والردود تتكرر بنفس الجودة.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">كيف تبدأ</h2>
        <ol className="flex list-decimal flex-col gap-3 ps-5 text-sm">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">أسعار واضحة</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="flex flex-col gap-2 rounded-xl border p-5">
            <h3 className="font-semibold">الاحترافية</h3>
            <p className="font-semibold text-2xl">$19 <span className="font-normal text-muted-foreground text-sm">/ شهرياً</span></p>
            <p className="text-muted-foreground text-sm">
              لشركة صغيرة تبدأ تنظم ردودها ومحتواها يومياً.
            </p>
          </article>
          <article className="flex flex-col gap-2 rounded-xl border p-5">
            <h3 className="font-semibold">الأعمال</h3>
            <p className="font-semibold text-2xl">$49 <span className="font-normal text-muted-foreground text-sm">/ شهرياً</span></p>
            <p className="text-muted-foreground text-sm">
              لعدة فروع أو فريق، مع مساحات عمل منفصلة لكل فرع.
            </p>
          </article>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl">أسئلة متكررة</h2>
        <div className="flex flex-col gap-3">
          {faqs.map((faq) => (
            <details className="rounded-xl border p-4" key={faq.q}>
              <summary className="cursor-pointer font-medium text-sm">{faq.q}</summary>
              <p className="mt-2 text-muted-foreground text-sm">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
        <h2 className="font-semibold text-xl">جرّبه على حالة حقيقية عندك</h2>
        <p className="text-muted-foreground text-sm">
          ابعت لنا رسالة واتساب، وخذ رد جاهز على آخر استفسار وصلك من عميل.
        </p>
        <a
          className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground"
          href={WA_LINK}
          rel="noopener noreferrer"
          target="_blank"
        >
          افتح محادثة واتساب
        </a>
      </section>

      <footer className="text-muted-foreground flex flex-wrap justify-center gap-3 text-xs">
        <a className="hover:underline" href="/">ZOOKA AI</a>
        <a className="hover:underline" href="/contact">تواصل معنا</a>
        <a className="hover:underline" href="/privacy">سياسة الخصوصية</a>
        <a className="hover:underline" href="/terms">شروط الخدمة</a>
      </footer>
    </main>
  );
}
