import Link from "next/link";

type Lang = "ar" | "en";

type Poster = { src: string; title: string; body: string; tag: string };

function posters(lang: Lang): Poster[] {
  const ar = lang === "ar";
  const t = (a: string, e: string) => (ar ? a : e);
  return [
    {
      src: "/images/posters/poster-1.jpg",
      tag: ar ? "ZOOKA AI" : "ZOOKA AI",
      title: t("وكيل أعمالك الذكي", "Your business agent"),
      body: t(
        "يربط أدواتك وينفّذ المهمة حتى النهاية — لا مجرد محادثة.",
        "Connects your tools and finishes the job, not just a chat."
      ),
    },
    {
      src: "/images/posters/poster-2.jpg",
      tag: ar ? "البريد والدرايف" : "EMAIL + DRIVE",
      title: t("بريدك وملفاتك في المحادثة", "Your email and files inside the chat"),
      body: t(
        "يقرأ ويبحث ويرسل من حسابك بعد موافقتك، والرموز مشفّرة لمساحتك.",
        "Reads, searches and sends from your own account after consent, tokens encrypted per workspace."
      ),
    },
    {
      src: "/images/posters/poster-3.jpg",
      tag: ar ? "وضع الوكيل" : "AGENT MODE",
      title: t("خطوة بخطوة حتى الإنجاز", "Step by step until it is done"),
      body: t(
        "يفتح الموافقة، يربط، ينفّذ، ثم يعود لك للقرار الحساس فقط.",
        "Opens consent, connects, executes, then comes back only for the sensitive decision."
      ),
    },
    {
      src: "/images/posters/poster-4.jpg",
      tag: ar ? "الربط الذاتي جاهز الآن" : "SELF-SERVE, LIVE NOW",
      title: t("كل أدواتك في مكان واحد", "Every tool in one place"),
      body: t(
        "جيميل ودرايف وجيت هب وفيرسل وn8n وسوبابيس — بضغطة واحدة.",
        "Gmail, Drive, GitHub, Vercel, n8n, Supabase and more in one click."
      ),
    },
    {
      src: "/images/posters/poster-5.jpg",
      tag: ar ? "الصوت" : "VOICE",
      title: t("اتكلم… وهو يكتب وينفّذ", "Speak, it writes and executes"),
      body: t(
        "محادثة صوتية بالعربي: تسجيل، تحويل لنص، ورد مقروء بصوت عالٍ.",
        "Arabic voice chat: record, transcribe, and hear the reply read aloud."
      ),
    },
    {
      src: "/images/posters/poster-6.jpg",
      tag: ar ? "النشر" : "SHIP FASTER",
      title: t("من الفكرة إلى النشر", "From idea to deployment"),
      body: t(
        "مراجعة كود ونشر على فيرسل من داخل المحادثة نفسها.",
        "Review code and deploy to Vercel from inside the same conversation."
      ),
    },
  ];
}

export function PostersSection({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  return (
    <section className="border-b border-white/10" id="posters">
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-blue-400 text-xs uppercase tracking-widest">
              {ar ? "البوسترات" : "Posters"}
            </span>
            <h2 className="mt-2 font-semibold text-3xl">
              {ar ? "التطبيق كله في 6 بوسترات" : "The whole product in six posters"}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {ar
                ? "كل بوستر يشرح جزءًا واحدًا بوضوح: الربط، التنفيذ، التكاملات، الصوت، والنشر. اضغط أي بوستر لعرضه بالحجم الكامل."
                : "Each poster explains one thing clearly: connecting, executing, integrations, voice and shipping. Tap any poster to open it full size."}
            </p>
          </div>
          <Link
            className="rounded-lg border border-white/15 px-4 py-2 text-sm transition-colors hover:bg-white/5"
            href="/register"
          >
            {ar ? "جرّبه بنفسك" : "Try it yourself"}
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posters(lang).map((poster) => (
            <a
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40"
              href={poster.src}
              key={poster.src}
              rel="noopener"
              target="_blank"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`${poster.tag} — ${poster.title}`}
                className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                decoding="async"
                height={450}
                loading="lazy"
                src={poster.src}
                width={360}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-10">
                <p
                  className={`text-[11px] text-blue-300 tracking-widest ${ar ? "" : "uppercase"}`}
                >
                  {poster.tag}
                </p>
                <h3 className="mt-1 font-medium text-white">{poster.title}</h3>
                <p className="mt-1 line-clamp-2 text-neutral-300 text-xs">
                  {poster.body}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VideoSection({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  return (
    <section className="border-b border-white/10" id="video">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            className="aspect-video w-full"
            controls
            loop
            muted
            playsInline
            poster="/images/zooka-demo-poster.png"
            preload="metadata"
            src="/videos/zooka-demo.mp4"
          />
        </div>
        <div>
          <span className="text-emerald-400 text-xs uppercase tracking-widest">
            {ar ? "فيديو تعريفي" : "Demo video"}
          </span>
          <h2 className="mt-2 font-semibold text-3xl">
            {ar ? "28 ثانية تشوف فيها التطبيق وهو بيعمل إيه" : "28 seconds of the product doing the work"}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {ar
              ? "عرض سريع بالعربي: من ربط الحساب، لتنفيذ خطوة بخطوة، للتكاملات، للمحادثة الصوتية، للنشر على فيرسل. مفيش كلام مبالغ — كل شاشة موجودة فعلًا في التطبيق."
              : "A fast Arabic walkthrough: connecting an account, multi-step execution, integrations, voice chat and shipping to Vercel. Every screen shown exists in the live product."}
          </p>
          <ul className="mt-5 grid gap-2 text-sm text-muted-foreground">
            {(ar
              ? [
                  "بدون صوت — تقدر تشغله في أي مكان",
                  "يشرح القدرات الستة الأساسية",
                  "نفس البوسترات المستخدمة في الصفحة",
                ]
              : [
                  "Silent, so it plays anywhere",
                  "Covers the six core capabilities",
                  "Built from the same posters as this page",
                ]
            ).map((item) => (
              <li className="flex gap-2" key={item}>
                <span aria-hidden="true" className="text-emerald-400">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm"
              href="/register"
            >
              {ar ? "أنشئ مساحة عملك" : "Create your workspace"}
            </Link>
            <Link
              className="rounded-lg border border-white/15 px-5 py-2.5 text-sm transition-colors hover:bg-white/5"
              href="/login"
            >
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  const steps = ar
    ? [
        {
          title: "أنشئ مساحة عملك",
          body: "بريد وكلمة مرور أو حساب جوجل، وتبدأ في دقيقة. بدون بطاقة.",
        },
        {
          title: "اربط أدواتك",
          body: "جيميل ودرايف وجيت هب وفيرسل وn8n… صفحة موافقة رسمية من المزوّد، والرموز مشفّرة.",
        },
        {
          title: "اطلب المهمة بالعربي",
          body: "«لخّص إيميلات النهاردة واقترح ردود» — الوكيل يفتح الملفات ويقرأ ويجهّز الرد.",
        },
        {
          title: "أنت تقرّر وتنفّذ",
          body: "تراجع، تعدّل، وتوافق. أي إجراء لطرف خارجي بيستنى إذنك.",
        },
      ]
    : [
        {
          title: "Create your workspace",
          body: "Email and password or a Google account, live in a minute. No card.",
        },
        {
          title: "Connect your tools",
          body: "Gmail, Drive, GitHub, Vercel, n8n — through the provider's own consent screen, tokens encrypted.",
        },
        {
          title: "Ask in plain Arabic",
          body: "\"Summarise today's email and suggest replies\" — the agent opens the files, reads, and drafts.",
        },
        {
          title: "You decide and send",
          body: "Review, edit, approve. Anything leaving to an outside party waits for you.",
        },
      ];
  return (
    <section className="border-b border-white/10" id="how">
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="font-semibold text-3xl">
          {ar ? "كيف يعمل في 4 خطوات" : "How it works in four steps"}
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {ar
            ? "من التسجيل لأول مهمة منفّذة، بدون إعداد تقني ولا طرف وسيط."
            : "From sign-up to your first finished task, with no technical setup and no middleman."}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div className="rounded-2xl border border-white/10 p-5" key={step.title}>
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-blue-500/15 font-semibold text-blue-300 text-sm">
                {index + 1}
              </span>
              <h3 className="mt-3 font-medium">{step.title}</h3>
              <p className="mt-2 text-muted-foreground text-sm">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function UseCases({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  const cases = ar
    ? [
        {
          title: "شركات التنظيف والخدمات",
          examples: [
            "رد احترافي على عميل متأخر الطلب",
            "تجميع طلبات الحجز في جدول واحد",
            "متابعة العملاء اللي مو ردوا",
          ],
        },
        {
          title: "المتاجر والمبيعات",
          examples: [
            "تحليل ملف مبيعات الشهر وأهم 5 ملاحظات",
            "كتابة وصف منتج بالعربي والإنجليزي",
            "خطة عروض أسبوعية جاهزة للنشر",
          ],
        },
        {
          title: "المكاتب والفرق",
          examples: [
            "تلخيص بريد الصباح وترتيب الأولويات",
            "تحويل محضر اجتماع لمهام بأصحابها",
            "تقرير أسبوعي جاهز للإدارة",
          ],
        },
      ]
    : [
        {
          title: "Cleaning & services",
          examples: [
            "A professional reply to a late-order complaint",
            "All booking requests in one clean table",
            "Follow-up on customers who never answered",
          ],
        },
        {
          title: "Retail & sales",
          examples: [
            "Analyse last month's sales file, top five findings",
            "Write a product description in Arabic and English",
            "A week of ready-to-post offers",
          ],
        },
        {
          title: "Offices & teams",
          examples: [
            "Summarise morning email and set priorities",
            "Turn meeting notes into owned tasks",
            "A weekly report the board can read",
          ],
        },
      ];
  return (
    <section className="border-b border-white/10" id="use-cases">
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="font-semibold text-3xl">
          {ar ? "لكل شغل… أمثلة حقيقية" : "For real work, real examples"}
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {ar
            ? "دي طلبات فعلية تقدر تكتبها زي ما هي في المحادثة."
            : "These are actual requests you can type into the chat as they are."}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cases.map((item) => (
            <article className="rounded-2xl border border-white/10 p-5" key={item.title}>
              <h3 className="font-medium">{item.title}</h3>
              <ul className="mt-3 flex flex-col gap-2 text-muted-foreground text-sm">
                {item.examples.map((example) => (
                  <li className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2" key={example}>
                    {example}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Compare({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  const rows = ar
    ? [
        ["يفتح صفحة الموافقة بنفسه ويربط الحساب", "لا", "نعم"],
        ["ينفّذ خطوات متعددة على أدواتك حتى النهاية", "رد واحد", "حتى الإنجاز"],
        ["يتعامل مع بريدك وملفاتك وكودك وبياناتك", "جزئي", "4 أنواع"],
        ["محادثة صوتية عربي + رد مقروء", "نادرًا", "مدمج"],
        ["سجل تدقيق لكل إجراء على التكاملات", "لا", "نعم"],
      ]
    : [
        ["Opens the consent screen and connects itself", "No", "Yes"],
        ["Runs multi-step work on your tools to the end", "One reply", "Until done"],
        ["Works with email, files, code and data", "Partly", "All four"],
        ["Arabic voice chat with spoken replies", "Rare", "Built in"],
        ["Audit trail for every integration action", "No", "Yes"],
      ];
  return (
    <section className="border-b border-white/10" id="compare">
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="font-semibold text-3xl">
          {ar ? "إيه الفرق عن مساعد محادثة عادي؟" : "What makes this different from a chat assistant?"}
        </h2>
        <p className="mt-3 text-muted-foreground text-sm">
          {ar
            ? "هذا الفرق بين المنتج ومساعد محادثة عام. الربط وسجل التدقيق ووضع الوكيل ليست ضمن التجربة المجانية ولا الباقة المجانية."
            : "This is the difference between the product and a general chat assistant. Connections, the audit trail and Agent mode are not part of the free preview or the free plan."}{" "}
          <Link className="underline" href="/compare/chatgpt">
            {ar ? "التفصيل" : "Details"}
          </Link>
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">
                  {ar ? "القدرة" : "Capability"}
                </th>
                <th className="p-3 text-start font-medium">
                  {ar ? "مساعد محادثة" : "Chat assistant"}
                </th>
                <th className="p-3 text-start font-medium text-blue-300">
                  Zooka AI
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-white/10 border-t" key={row[0]}>
                  <td className="p-3">{row[0]}</td>
                  <td className="p-3 text-muted-foreground">{row[1]}</td>
                  <td className="p-3 font-medium text-emerald-400">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
