import Link from "next/link";

const useCases = {
  agents: {
    eyebrow: "ZOOKA AI / مساحة الأفراد",
    title: "من فكرة مبعثرة إلى مسودة تستطيع تطويرها.",
    description:
      "ابدأ بهدف واضح، اختر قالباً، وراجع النتيجة قبل أي خطوة خارج التطبيق. أنت صاحب القرار، والوكيل يساعدك على التحضير.",
    cards: [
      [
        "خطّط يومك",
        "اطلب خطة قصيرة بالأولويات والوقت المتوقع، ثم عدّلها بما يناسبك.",
      ],
      [
        "اكتب بطريقتك",
        "جهّز مسودة بريد أو محتوى بالعربية والإنجليزية، وراجعها قبل الإرسال.",
      ],
      [
        "حوّل الفكرة إلى مشروع",
        "استكشف قوالب Studio وابنِ تصوراً واضحاً للخطوة التالية.",
      ],
    ],
    sample:
      "ساعدني أحوّل فكرتي إلى خطة من ثلاث خطوات. اسألني عن الهدف والقيود أولاً، ولا تنفذ أي إجراء خارجي دون موافقتي.",
    otherHref: "/lp/teams",
    otherLabel: "تبحث عن استخدام لفريقك؟",
  },
  teams: {
    eyebrow: "ZOOKA AI / فرق الخدمات",
    title: "رتّب العمل المتكرر. واترك القرارات لفريقك.",
    description:
      "ابدأ بمهمة واحدة: مسودة عرض، رد على عميل، أو خطة محتوى. اختبر النتيجة أولاً، ثم اربط فقط الأدوات التي يحتاجها عملك.",
    cards: [
      [
        "ردود قابلة للمراجعة",
        "وحّد نبرة فريقك مع مسودات لاستفسارات العملاء، دون ادعاء إرسالها تلقائياً.",
      ],
      [
        "عروض أكثر وضوحاً",
        "جهّز هيكل عرض سعر من خدماتك ومدخلاتك؛ راجع الأسعار والمواعيد بنفسك.",
      ],
      [
        "ربط باختيارك",
        "اتصال الحسابات اختياري ويتطلب إعداداً وصلاحيات وباقة مناسبة. وجود بطاقة تكامل لا يثبت تشغيله.",
      ],
    ],
    sample:
      "جهّز لي مسودة عرض لخدمة أقدمها. اسأل عن النطاق والسعر والمدة، ولا تخترع أسعاراً أو ترسل شيئاً للعميل.",
    otherHref: "/lp/agents",
    otherLabel: "تريد مساحة لاستخدامك الشخصي؟",
  },
} as const;

export function UseCaseLanding({
  audience,
}: {
  audience: keyof typeof useCases;
}) {
  const content = useCases[audience];
  return (
    <main
      className="mx-auto min-h-dvh max-w-6xl px-6 py-12 md:py-20"
      dir="rtl"
      lang="ar"
    >
      <nav
        aria-label="التنقل"
        className="mb-16 flex flex-wrap items-center justify-between gap-4"
      >
        <Link className="text-xl font-semibold tracking-tight" href="/">
          ZOOKA AI
        </Link>
        <div className="flex gap-5 text-sm">
          <Link className="underline underline-offset-4" href="/pricing">
            الخطط
          </Link>
          <Link className="underline underline-offset-4" href="/login">
            تسجيل الدخول
          </Link>
        </div>
      </nav>
      <section
        aria-labelledby="landing-title"
        className="grid gap-10 md:grid-cols-2 md:items-center"
      >
        <div className="flex flex-col items-start gap-6">
          <p className="text-muted-foreground text-sm">{content.eyebrow}</p>
          <h1
            className="text-4xl leading-tight font-semibold md:text-5xl"
            id="landing-title"
          >
            {content.title}
          </h1>
          <p className="text-muted-foreground text-lg leading-8">
            {content.description}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className="bg-foreground text-background rounded-xl px-6 py-3 font-medium"
              href="/register"
            >
              ابدأ بإنشاء حساب
            </Link>
            <Link className="rounded-xl border px-6 py-3" href="/studio">
              استكشف القوالب أولاً
            </Link>
          </div>
          <p className="text-muted-foreground text-xs">
            لا نعد بنتيجة أو دخل مضمون. راجع المخرجات، وتحقق من صلاحيات أي
            إجراء.
          </p>
        </div>
        <aside
          aria-label="مثال لمهمة"
          className="bg-muted/40 rounded-3xl border p-7 shadow-sm"
        >
          <span className="bg-background rounded-full border px-3 py-1 text-xs">
            مثال توضيحي — ليس تنفيذاً فعلياً
          </span>
          <p className="mt-7 text-xl leading-9">«{content.sample}»</p>
          <ol className="text-muted-foreground mt-8 grid gap-3 text-sm">
            <li>١. حدّد هدفك والقيود.</li>
            <li>٢. راجع المسودة وعدّلها.</li>
            <li>٣. وافق على الإجراء المطلوب بوضوح.</li>
          </ol>
        </aside>
      </section>
      <section
        aria-label="طرق البداية"
        className="mt-16 grid gap-4 md:grid-cols-3"
      >
        {content.cards.map(([title, body]) => (
          <article className="rounded-2xl border p-6" key={title}>
            <h2 className="mb-3 text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm leading-7">{body}</p>
          </article>
        ))}
      </section>
      <footer className="text-muted-foreground mt-14 flex flex-wrap justify-between gap-4 border-t pt-6 text-sm">
        <Link className="underline underline-offset-4" href={content.otherHref}>
          {content.otherLabel}
        </Link>
        <div className="flex gap-5">
          <Link href="/privacy">الخصوصية</Link>
          <Link href="/terms">الشروط</Link>
        </div>
      </footer>
    </main>
  );
}
