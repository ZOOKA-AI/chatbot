import {
  ArrowUpLeft,
  ArrowUpRight,
  Blocks,
  Cable,
  Check,
  ClipboardList,
  Code2,
  Gamepad2,
  LayoutTemplate,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import type { Lang } from "@/lib/i18n";
import { platformAreas, readinessItems } from "@/lib/platform-navigation";
import styles from "./platform.module.css";

const icons = [
  Blocks,
  LayoutTemplate,
  ClipboardList,
  Gamepad2,
  Cable,
  UserRound,
];
export function PlatformHeader({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  return (
    <header className={styles.header}>
      <Link
        aria-label="Zooka AI — الرئيسية"
        className={styles.logo}
        href="/explore"
      >
        <span>
          <Sparkles size={22} />
        </span>
        <strong>
          ZOOKA<span> AI</span>
        </strong>
      </Link>
      <nav aria-label={ar ? "تنقل المنصة" : "Platform navigation"}>
        <Link href="/explore#spaces">{ar ? "المساحات" : "Spaces"}</Link>
        <Link href="/studio/templates">{ar ? "القوالب" : "Templates"}</Link>
        <Link href="/studio/integrations">
          {ar ? "التكاملات" : "Integrations"}
        </Link>
        <Link href="/platform-readiness">{ar ? "الجاهزية" : "Readiness"}</Link>
        <Link href="/pricing">{ar ? "الباقات" : "Plans"}</Link>
      </nav>
      <div className={styles.headerActions}>
        <LanguageToggle className={styles.language} lang={lang} />
        <Link className={styles.login} href="/login">
          {ar ? "دخول" : "Sign in"}
        </Link>
        <Link className={styles.primary} href="/studio">
          {ar ? "افتح مساحتك" : "Open Studio"}
          <ArrowUpLeft size={15} />
        </Link>
      </div>
    </header>
  );
}

export function PlatformSite({
  lang,
  readiness = false,
}: {
  lang: Lang;
  readiness?: boolean;
}) {
  const ar = lang === "ar";
  const text = (arabic: string, english: string) => (ar ? arabic : english);
  return (
    <div className={styles.platform} dir={ar ? "rtl" : "ltr"} lang={lang}>
      <a className={styles.skip} href="#platform-main">
        {text("إلى المحتوى", "Skip to content")}
      </a>
      <PlatformHeader lang={lang} />
      <main id="platform-main">
        {readiness ? (
          <>
            <section className={styles.readinessHero}>
              <span className={styles.eyebrow}>
                <ShieldCheck size={17} />
                {text(
                  "حدود واضحة، ثقة أكبر",
                  "Clear boundaries, greater trust",
                )}
              </span>
              <h1>
                {text(
                  "ما الذي يعمل، وما الذي يحتاج خطوة أخرى؟",
                  "What works, and what needs another step?",
                )}
              </h1>
              <p>
                {text(
                  "دليل جاهزية وظيفي، وليس لوحة مراقبة مباشرة أو ضمان توافر. لا نخفي المتطلبات خلف زر ملوّن.",
                  "A functional readiness guide, not a live monitor or availability guarantee. A colored button is not proof of a connection.",
                )}
              </p>
              <Link className={styles.secondary} href="/studio/integrations">
                {text("استعرض دليل الموصلات", "Explore connector guides")}
                <ArrowUpLeft size={16} />
              </Link>
            </section>
            <section className={styles.contentSection}>
              <div className={styles.readinessGrid}>
                {readinessItems.map((item) => (
                  <article className={styles.readinessCard} key={item.en}>
                    <span>{ar ? item.arState : item.enState}</span>
                    <h2>{ar ? item.ar : item.en}</h2>
                    <p>{ar ? item.arDetail : item.enDetail}</p>
                  </article>
                ))}
              </div>
              <div className={styles.note}>
                <LockKeyhole size={25} />
                <div>
                  <h2>
                    {text(
                      "قبل أي تفعيل خارجي",
                      "Before any external activation",
                    )}
                  </h2>
                  <p>
                    {text(
                      "يلزم تطبيق رسمي وصلاحيات المزوّد، تخزين رموز آمن، عزل مساحات العمل واختبار العمليات. لا تُرسل الأسرار في المحادثة أو ملفات المشاريع. تغيير DNS ليس علاجاً لخطأ في حفظ الرسائل.",
                      "Provider registration, authorization, secure token storage, workspace isolation and operation tests are required. Never send secrets in chat or project files. DNS changes do not fix message persistence errors.",
                    )}
                  </p>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.eyebrow}>
                  <span />
                  {text(
                    "ZOOKA / من الفكرة إلى مساحة عمل",
                    "ZOOKA / From idea to workspace",
                  )}
                </span>
                <h1>
                  {text("فكّر بطموح.", "Think boldly.")}
                  <br />
                  <em>{text("وابنِ بوضوح.", "Build clearly.")}</em>
                </h1>
                <p>
                  {text(
                    "محادثة، قوالب، كود ومهام في تجربة واحدة. مساحة عربية للإبداع والعمل، تُظهر لك المتاح فعلاً والخطوة التالية دون وعود وهمية.",
                    "Chat, templates, code and tasks in one connected experience. A creative workspace that shows what is available and what comes next, without invented capabilities.",
                  )}
                </p>
                <div className={styles.heroActions}>
                  <Link className={styles.primary} href="/studio">
                    {text("ابدأ من مساحة العمل", "Start in Studio")}
                    <ArrowUpLeft size={18} />
                  </Link>
                  <Link className={styles.secondary} href="/studio/templates">
                    {text("اختر قالباً جاهزاً", "Choose a template")}
                    <LayoutTemplate size={17} />
                  </Link>
                </div>
                <div className={styles.heroHints}>
                  <span>
                    <Check size={14} />
                    {text("قوالب قابلة للتنزيل", "Downloadable templates")}
                  </span>
                  <span>
                    <Check size={14} />
                    {text("معاينة دون حساب", "Review without an account")}
                  </span>
                  <span>
                    <Check size={14} />
                    {text("لا نشر تلقائي", "No automatic publishing")}
                  </span>
                </div>
              </div>
              <div className={styles.heroVisual}>
                <div className={styles.visualTop}>
                  <span>ZOOKA STUDIO</span>
                  <span>
                    {text(
                      "تجربة فعلية، لا محاكاة اتصال",
                      "Real tools, not fake connections",
                    )}
                  </span>
                </div>
                <div className={styles.visualTitle}>
                  <Sparkles size={25} />
                  <h2>
                    {text("ماذا ستبني اليوم؟", "What will you build today?")}
                  </h2>
                </div>
                <Link
                  className={styles.visualProject}
                  href="/studio/code?template=business"
                >
                  <div>
                    <span>
                      {text("قالب قابل للتحرير", "Editable template")}
                    </span>
                    <strong>
                      {text("موقع شركة خدمات", "Service business website")}
                    </strong>
                  </div>
                  <Code2 size={33} />
                </Link>
                <div className={styles.visualGrid}>
                  <Link href="/studio/tasks">
                    <ClipboardList size={21} />
                    {text("نظّم المهام", "Organize tasks")}
                  </Link>
                  <Link href="/studio/play">
                    <Gamepad2 size={21} />
                    {text("خذ استراحة", "Take a break")}
                  </Link>
                </div>
                <Link
                  className={styles.visualBottom}
                  href="/platform-readiness"
                >
                  <ShieldCheck size={17} />
                  {text(
                    "اعرف حالة الجاهزية قبل أن تبدأ",
                    "Check readiness before you begin",
                  )}
                  <ArrowUpLeft size={16} />
                </Link>
              </div>
            </section>
            <div className={styles.trustStrip}>
              <span>
                {text(
                  "أدوات واضحة. قرارات بيدك.",
                  "Clear tools. Your decisions.",
                )}
              </span>
              <Link href="/privacy">
                {text("الخصوصية أولاً", "Privacy first")}
              </Link>
              <Link href="/platform-readiness">
                {text("الجاهزية بشفافية", "Transparent readiness")}
              </Link>
              <Link href="/contact">{text("تواصل حقيقي", "Contact us")}</Link>
            </div>
            <section className={styles.contentSection} id="spaces">
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.eyebrow}>
                    {text("مساحات متصلة", "Connected spaces")}
                  </span>
                  <h2>
                    {text("كل خطوة لها مكان.", "A place for every step.")}
                  </h2>
                </div>
                <p>
                  {text(
                    "ادخل من الفكرة أو المشروع أو الأداة. تنقّل دون أن تفقد الطريق.",
                    "Start with an idea, a project or a tool. Stay oriented as you move.",
                  )}
                </p>
              </div>
              <div className={styles.areas}>
                {platformAreas.map((area, i) => {
                  const Icon = icons[i];
                  return (
                    <Link
                      className={styles.areaCard}
                      href={area.href}
                      key={area.id}
                    >
                      <span className={styles.areaIcon}>
                        <Icon size={24} />
                      </span>
                      <small>{ar ? area.arState : area.enState}</small>
                      <h3>{ar ? area.ar : area.en}</h3>
                      <p>{ar ? area.arDescription : area.enDescription}</p>
                      <span className={styles.areaAction}>
                        {text("استكشف المساحة", "Explore this space")}
                        <ArrowUpLeft size={17} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
            <section className={styles.workflow}>
              <div>
                <span className={styles.eyebrow}>
                  {text("رحلة بسيطة", "A simple journey")}
                </span>
                <h2>
                  {text(
                    "ابدأ صغيراً. طوّر بثقة.",
                    "Start small. Build with confidence.",
                  )}
                </h2>
                <p>
                  {text(
                    "لا نحتاج إلى عشرات الأزرار الوهمية. نحتاج خطوات تفتح أدوات حقيقية.",
                    "Not dozens of pretend buttons. Clear steps that open real tools.",
                  )}
                </p>
              </div>
              <ol>
                {[
                  {
                    n: "01",
                    title: text(
                      "اختر نقطة البداية",
                      "Choose your starting point",
                    ),
                    desc: text(
                      "ستة قوالب فعلية قابلة للتطوير.",
                      "Six real templates ready to customize.",
                    ),
                    href: "/studio/templates",
                  },
                  {
                    n: "02",
                    title: text("عدّل وشاهد النتيجة", "Edit and inspect"),
                    desc: text(
                      "محرر ومعاينة HTML معزولة.",
                      "Editor and isolated HTML preview.",
                    ),
                    href: "/studio/code",
                  },
                  {
                    n: "03",
                    title: text("احفظ وانقل مشروعك", "Save and take your work"),
                    desc: text(
                      "حفظ محلي ونسخ احتياطية واستيراد.",
                      "Local save, backup and import.",
                    ),
                    href: "/studio/projects",
                  },
                ].map((step) => (
                  <li key={step.n}>
                    <Link href={step.href}>
                      <span>{step.n}</span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.desc}</p>
                      </div>
                      <ArrowUpLeft size={18} />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
            <section className={styles.contentSection} id="conversation">
              <div className={styles.conversation}>
                <Sparkles size={31} />
                <div>
                  <h2>
                    {text(
                      "تريد المحادثة والذكاء الاصطناعي؟",
                      "Looking for AI chat?",
                    )}
                  </h2>
                  <p>
                    {text(
                      "المحادثة داخل حسابك، وليست أداة توليد وهمية في صفحة التعريف. ظهرت أخطاء حفظ رسائل سابقاً؛ راجع الجاهزية، وسجّل الدخول لاختبار حسابك.",
                      "Chat lives in your account, not a pretend generator on this page. Message-save failures were previously observed; review readiness and sign in to test your account.",
                    )}
                  </p>
                </div>
                <Link className={styles.primary} href="/login">
                  {text("تسجيل الدخول للمحادثة", "Sign in for chat")}
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </section>
            <section className={styles.contentSection} id="faq">
              <div className={styles.sectionHeading}>
                <h2>
                  {text("إجابات بلا مبالغة.", "Answers without exaggeration.")}
                </h2>
                <Link className={styles.inlineLink} href="/platform-readiness">
                  {text("كل تفاصيل الجاهزية", "Full readiness details")}
                  <ArrowUpLeft size={16} />
                </Link>
              </div>
              <div className={styles.faq}>
                {[
                  {
                    q: text(
                      "هل كل الأدوات والتكاملات مفعّلة؟",
                      "Are all tools and integrations active?",
                    ),
                    a: text(
                      "لا. أدوات الاستوديو المحلية قابلة للتجربة. الكتالوج يوضح موصلات لها مسار إعداد وأخرى تحتاج تنفيذًا وموافقة المزوّد. ظهور الشعار لا يعني اتصال حسابك.",
                      "No. Local Studio tools can be tried. The catalog distinguishes existing setup paths from connectors requiring implementation and approval. A logo is not a connection.",
                    ),
                  },
                  {
                    q: text(
                      "أين تُحفظ المشاريع والمهام؟",
                      "Where are projects and tasks stored?",
                    ),
                    a: text(
                      "على متصفحك فقط في هذه النسخة، دون مزامنة سحابية. صدّر نسخًا احتياطية؛ الملفات غير مشفّرة ولا ينبغي تخزين أسرار فيها.",
                      "Only in this browser in this revision, without cloud sync. Export backups; files are unencrypted and must not contain secrets.",
                    ),
                  },
                  {
                    q: text(
                      "هل توجد باقات أو اشتراكات؟",
                      "Are there subscription plans?",
                    ),
                    a: text(
                      "توجد صفحة باقات منفصلة تعتمد إعدادات التطبيق الفعلية. لا تنطبق الأسعار المقترحة في النماذج التصميمية تلقائيًا، ولا تضمن الباقة تشغيل موصل غير منفّذ.",
                      "The plans page uses actual application configuration. Prices in design mockups do not apply automatically, and a subscription cannot activate an unimplemented connector.",
                    ),
                  },
                  {
                    q: text(
                      "هل هذه منصة فتاوى معتمدة أو محفظة مالية؟",
                      "Is this certified religious advice or a financial wallet?",
                    ),
                    a: text(
                      "لا ندّعي اعتمادًا شرعيًا أو نسب دقة أو خدمة مالية أو اتصالات فضائية غير موثقة. يمكن توسيع المنتج بعد تنفيذ المتطلبات والتحقق منها، لا بمجرد وصفها.",
                      "We claim no unverified religious certification, accuracy percentage, financial service or satellite connection. Expansion requires implementation and verification, not just a description.",
                    ),
                  },
                ].map((item) => (
                  <details key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
            <section className={styles.finalCta}>
              <span className={styles.eyebrow}>
                {text("الخطوة القادمة بين يديك", "Your next step")}
              </span>
              <h2>
                {text(
                  "شيء حقيقي تبدأه اليوم.",
                  "Something real to start today.",
                )}
              </h2>
              <div className={styles.heroActions}>
                <Link className={styles.primary} href="/studio">
                  {text("جرّب مساحة العمل", "Try Studio")}
                  <ArrowUpLeft size={18} />
                </Link>
                <Link className={styles.secondary} href="/register">
                  {text("أنشئ حسابك", "Create your account")}
                </Link>
                <Link className={styles.inlineLink} href="/pricing">
                  {text("الباقات والحدود", "Plans and limits")}
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
      <div className={styles.bottomNav}>
        <Link href="/explore">{text("المنصة", "Platform")}</Link>
        <Link href="/studio">Studio</Link>
        <Link href="/workspace">{text("مساحة الفريق", "Team workspace")}</Link>
        <Link href="/settings/integrations">
          {text("إعداد الربط", "Connection settings")}
        </Link>
        <Link href="/privacy">{text("الخصوصية", "Privacy")}</Link>
        <Link href="/terms">{text("الشروط", "Terms")}</Link>
        <Link href="/contact">{text("التواصل", "Contact")}</Link>
      </div>
    </div>
  );
}
