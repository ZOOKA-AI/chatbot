/**
 * Support Center content. Every answer here points at a page or setting that
 * exists in this repository today; tests/unit/support-content.test.ts checks
 * that each internal link is one of the known routes.
 *
 * What this module deliberately does NOT claim:
 * - live 24/7 support (no staffed live channel exists);
 * - a response-time SLA;
 * - a ticket system (specified in docs/experience-2/SUPPORT-CENTER-SPEC.md,
 *   needs a database migration approved by the owner first).
 */

export const SUPPORT_EMAIL = "support@zooka-ai.com";
export const GENERAL_EMAIL = "info@zooka-ai.com";
export const REPO_ISSUES = "https://github.com/ZOOKA-AI/chatbot/issues/new";

interface Bilingual {
  ar: string;
  en: string;
}

export interface HelpTopic {
  id: string;
  title: Bilingual;
  body: Bilingual;
  links: { href: string; label: Bilingual }[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "account",
    title: { ar: "الحساب وتسجيل الدخول", en: "Account and sign-in" },
    body: {
      ar: "الدخول برقم الهاتف أو Google أو Facebook أو البريد وكلمة المرور. نسيت كلمة المرور؟ استخدم صفحة الاستعادة.",
      en: "Sign in with phone, Google, Facebook or email and password. Forgot your password? Use the reset page.",
    },
    links: [
      { href: "/login", label: { ar: "تسجيل الدخول", en: "Sign in" } },
      {
        href: "/forgot-password",
        label: { ar: "استعادة كلمة المرور", en: "Reset password" },
      },
      {
        href: "/settings/account",
        label: { ar: "إعدادات الحساب", en: "Account settings" },
      },
    ],
  },
  {
    id: "billing",
    title: { ar: "الباقات والفوترة", en: "Plans and billing" },
    body: {
      ar: "الترقية والتخفيض والإلغاء من صفحة الباقة. سياسة الاسترداد منشورة على الموقع.",
      en: "Upgrade, downgrade or cancel from the plan page. The refund policy is published on the site.",
    },
    links: [
      {
        href: "/workspace/billing",
        label: { ar: "الباقة والاستخدام", en: "Plan and usage" },
      },
      { href: "/pricing", label: { ar: "الأسعار", en: "Pricing" } },
      {
        href: "/refund",
        label: { ar: "سياسة الاسترداد", en: "Refund policy" },
      },
    ],
  },
  {
    id: "integrations",
    title: { ar: "التكاملات", en: "Integrations" },
    body: {
      ar: "الربط عبر صفحة موافقة المزوّد الرسمية (OAuth). كل تكامل يعرض حالته الحقيقية، ويمكنك فصله في أي وقت.",
      en: "Connections use the provider's official consent screen (OAuth). Each integration shows its real status and can be disconnected at any time.",
    },
    links: [
      {
        href: "/settings/integrations",
        label: { ar: "صفحة التكاملات", en: "Integrations page" },
      },
    ],
  },
  {
    id: "developers",
    title: { ar: "المطورون وMCP", en: "Developers and MCP" },
    body: {
      ar: "أنشئ مفتاح MCP لمساحة عملك واربط Claude أو أي عميل يدعم Model Context Protocol. الكود مفتوح على GitHub.",
      en: "Create an MCP key for your workspace and connect Claude or any Model Context Protocol client. The code is on GitHub.",
    },
    links: [
      { href: "/settings/mcp", label: { ar: "مفاتيح MCP", en: "MCP keys" } },
      {
        href: "https://github.com/ZOOKA-AI/chatbot",
        label: { ar: "المستودع على GitHub", en: "GitHub repository" },
      },
    ],
  },
  {
    id: "security",
    title: { ar: "الأمان والخصوصية", en: "Security and privacy" },
    body: {
      ar: "رموز التكاملات مشفّرة بـ AES-256-GCM ومربوطة بمساحة عملك. صفحة الأمان تعرض نتائج فحص حقيقية بتاريخها.",
      en: "Integration tokens are encrypted with AES-256-GCM and scoped to your workspace. The security page shows dated, real check results.",
    },
    links: [
      {
        href: "/workspace/security",
        label: { ar: "صفحة الأمان", en: "Security page" },
      },
      {
        href: "/privacy",
        label: { ar: "سياسة الخصوصية", en: "Privacy policy" },
      },
    ],
  },
  {
    id: "usage",
    title: { ar: "الاستهلاك والحدود", en: "Usage and limits" },
    body: {
      ar: "تابع عدد الرسائل والتوكنز وحدود باقتك من صفحة الاستخدام. العدّاد محفوظ على الخادم.",
      en: "Track messages, tokens and plan limits on the usage page. The counter is kept on the server.",
    },
    links: [
      {
        href: "/settings/usage",
        label: { ar: "الاستخدام والحدود", en: "Usage and limits" },
      },
    ],
  },
];

export interface FaqItem {
  q: Bilingual;
  a: Bilingual;
  href?: string;
}

/** The ten questions the Experience 2.0 brief asked for, answered from the product as it is. */
export const SUPPORT_FAQ: FaqItem[] = [
  {
    q: { ar: "ما هي ZOOKA-AI؟", en: "What is ZOOKA-AI?" },
    a: {
      ar: "منصة ذكاء اصطناعي تجمع المحادثة والوكلاء والأتمتة والتكاملات والاستوديو في مساحة عمل واحدة، بواجهة عربية وإنجليزية.",
      en: "An AI platform that brings chat, agents, automation, integrations and a studio into one workspace, in Arabic and English.",
    },
    href: "/about",
  },
  {
    q: { ar: "كيف أنشئ حسابًا؟", en: "How do I create an account?" },
    a: {
      ar: "من صفحة إنشاء الحساب، برقم الهاتف أو Google أو Facebook أو البريد. يمكنك أيضًا تجربة المحادثة قبل التسجيل.",
      en: "From the register page, with phone, Google, Facebook or email. You can also try the chat before registering.",
    },
    href: "/register",
  },
  {
    q: { ar: "كيف أستخدم الوكلاء؟", en: "How do I use agents?" },
    a: {
      ar: "فعّل وضع الوكيل في المحادثة: يحصل النموذج على أدواتك المتصلة وينفّذ المهمة خطوة بخطوة، ويطلب موافقتك قبل الإجراءات الحساسة.",
      en: "Turn on agent mode in the chat: the model gets your connected tools and runs the task step by step, asking before sensitive actions.",
    },
    href: "/workspace/agents",
  },
  {
    q: { ar: "كيف أربط التكاملات؟", en: "How do I connect integrations?" },
    a: {
      ar: "من صفحة التكاملات اضغط ربط، ووافق في صفحة المزوّد الرسمية. لا نطلب كلمة مرور حسابك أبدًا.",
      en: "On the integrations page press Connect and approve on the provider's official page. We never ask for your account password.",
    },
    href: "/settings/integrations",
  },
  {
    q: { ar: "هل يمكن استخدام API؟", en: "Can I use an API?" },
    a: {
      ar: "نعم عبر MCP: أنشئ مفتاحًا من صفحة MCP واربط أي عميل يدعم البروتوكول. كل استدعاء يُحسب على محفظة التوكنز.",
      en: "Yes, through MCP: create a key on the MCP page and connect any client that supports the protocol. Each call is charged to the token wallet.",
    },
    href: "/settings/mcp",
  },
  {
    q: { ar: "هل توجد واجهة عربية؟", en: "Is there an Arabic interface?" },
    a: {
      ar: "نعم. العربية هي اللغة الافتراضية مع اتجاه من اليمين لليسار، والتبديل إلى الإنجليزية من زر اللغة أعلى الصفحة.",
      en: "Yes. Arabic is the default with right-to-left layout; switch to English with the language button at the top.",
    },
  },
  {
    q: { ar: "كيف أتواصل مع الدعم؟", en: "How do I contact support?" },
    a: {
      ar: "راسلنا على support@zooka-ai.com، أو أبلغ عن مشكلة تقنية على GitHub. الدعم بالبريد وليس دعمًا مباشرًا على مدار الساعة.",
      en: "Email support@zooka-ai.com, or report a technical issue on GitHub. Support is by email, not a live 24/7 channel.",
    },
  },
  {
    q: { ar: "كيف أحمي حسابي؟", en: "How do I protect my account?" },
    a: {
      ar: "استخدم كلمة مرور قوية لا تكررها في مواقع أخرى، وافصل أي تكامل لا تستخدمه، ولا تشارك مفاتيح MCP.",
      en: "Use a strong password you do not reuse, disconnect integrations you no longer use, and never share MCP keys.",
    },
    href: "/workspace/security",
  },
  {
    q: { ar: "كيف أتابع استهلاكي؟", en: "How do I track my usage?" },
    a: {
      ar: "صفحة الاستخدام تعرض الرسائل والتوكنز وحدود باقتك.",
      en: "The usage page shows messages, tokens and your plan limits.",
    },
    href: "/settings/usage",
  },
  {
    q: { ar: "كيف أحذف بياناتي؟", en: "How do I delete my data?" },
    a: {
      ar: "من إعدادات الحساب، زر حذف الحساب يطلب تأكيدًا قبل التنفيذ لأن الحذف لا يمكن التراجع عنه.",
      en: "In account settings, the delete account button asks for confirmation first, because deletion cannot be undone.",
    },
    href: "/settings/account",
  },
];

export function bugReportMailto(lang: "ar" | "en"): string {
  const subject = lang === "ar" ? "بلاغ عن مشكلة" : "Bug report";
  const body =
    lang === "ar"
      ? "الصفحة:\nما الذي حدث:\nما المتوقع:\nالجهاز والمتصفح:\n"
      : "Page:\nWhat happened:\nWhat you expected:\nDevice and browser:\n";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function featureRequestMailto(lang: "ar" | "en"): string {
  const subject = lang === "ar" ? "اقتراح ميزة" : "Feature request";
  const body =
    lang === "ar"
      ? "الميزة المقترحة:\nالمشكلة التي تحلها:\n"
      : "Suggested feature:\nThe problem it solves:\n";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
