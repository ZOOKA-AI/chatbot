/**
 * The one public navigation model. Every public page renders the same header and
 * footer from this list, so no page is reachable only by typing its URL.
 * Anchors are absolute ("/#plans") because the header is now global: a bare
 * "#plans" would break on every page except the landing page.
 */
export type NavLink = {
  readonly href: string;
  readonly ar: string;
  readonly en: string;
  readonly hintAr?: string;
  readonly hintEn?: string;
};

export type NavGroup = {
  readonly ar: string;
  readonly en: string;
  readonly items: readonly NavLink[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    ar: "المنتج",
    en: "Product",
    items: [
      {
        href: "/#posters",
        ar: "المميزات والبوسترات",
        en: "Features",
        hintAr: "شوف التطبيق في 6 بوسترات",
        hintEn: "Six posters that show the app",
      },
      {
        href: "/#capabilities",
        ar: "ماذا ينفّذ فعليًا",
        en: "What it does",
        hintAr: "قدرات مبنية ومختبَرة",
        hintEn: "Capabilities built and tested",
      },
      {
        href: "/#integrations",
        ar: "التكاملات",
        en: "Integrations",
        hintAr: "مسارات ربط منفذة",
        hintEn: "Implemented connection paths",
      },
      {
        href: "/#templates",
        ar: "قوالب مهام جاهزة",
        en: "Ready-made tasks",
        hintAr: "مهمة تتنفّذ بضغطة واحدة",
        hintEn: "A task that runs in one tap",
      },
      {
        href: "/#plans",
        ar: "الباقات والأسعار",
        en: "Plans and pricing",
        hintAr: "مجاني، احترافي، أعمال، مؤسسات",
        hintEn: "Free, Pro, Business, Enterprise",
      },
    ],
  },
  {
    ar: "المنصة",
    en: "Platform",
    items: [
      {
        href: "/studio",
        ar: "ستوديو زوكا",
        en: "Zooka Studio",
        hintAr: "مساحة العمل الكاملة",
        hintEn: "The full workspace",
      },
      {
        href: "/explore",
        ar: "استكشف",
        en: "Explore",
        hintAr: "قوالب وأدوات ومشاريع",
        hintEn: "Templates, tools and projects",
      },
      {
        href: "/pricing",
        ar: "الأسعار",
        en: "Pricing",
        hintAr: "الأربع باقات بالتفصيل",
        hintEn: "All four plans in detail",
      },
      {
        href: "/blog",
        ar: "المدونة",
        en: "Blog",
        hintAr: "مقالات ودلائل عملية",
        hintEn: "Guides and articles",
      },
      {
        href: "/platform-readiness",
        ar: "الجاهزية",
        en: "Readiness",
        hintAr: "ما هو مكتمل وما هو قيد التجهيز",
        hintEn: "What is done and what is pending",
      },
    ],
  },
  {
    ar: "الشركات",
    en: "Business",
    items: [
      {
        href: "/lp/cleaning",
        ar: "شركات التنظيف",
        en: "Cleaning companies",
        hintAr: "حل مخصص لقطاع الخدمات",
        hintEn: "Built for service businesses",
      },
      {
        href: "/partners",
        ar: "الشركاء",
        en: "Partners",
        hintAr: "برنامج الشركاء والعمولة",
        hintEn: "Partner programme",
      },
      {
        href: "/compare/chatgpt",
        ar: "زوكا مقابل ChatGPT",
        en: "Zooka vs ChatGPT",
        hintAr: "الفرق الحقيقي",
        hintEn: "The honest difference",
      },
      {
        href: "/about",
        ar: "عن زوكا",
        en: "About",
        hintAr: "من نحن",
        hintEn: "Who we are",
      },
      {
        href: "/contact",
        ar: "تواصل معنا",
        en: "Contact",
        hintAr: "للشركات والفروع",
        hintEn: "For companies and branches",
      },
    ],
  },
];

/** Footer columns: every public page is listed here at least once. */
export const FOOTER_GROUPS: readonly NavGroup[] = [
  {
    ar: "المنصة",
    en: "Platform",
    items: [
      { href: "/studio", ar: "ستوديو زوكا", en: "Studio" },
      { href: "/explore", ar: "استكشف", en: "Explore" },
      { href: "/pricing", ar: "الأسعار", en: "Pricing" },
      { href: "/blog", ar: "المدونة", en: "Blog" },
      { href: "/platform-readiness", ar: "الجاهزية", en: "Readiness" },
    ],
  },
  {
    ar: "الحلول",
    en: "Solutions",
    items: [
      { href: "/lp/cleaning", ar: "شركات التنظيف", en: "Cleaning" },
      { href: "/partners", ar: "الشركاء", en: "Partners" },
      { href: "/compare/chatgpt", ar: "مقابل ChatGPT", en: "vs ChatGPT" },
      { href: "/contact", ar: "تواصل معنا", en: "Contact" },
      { href: "/about", ar: "عن زوكا", en: "About" },
    ],
  },
];

/** Routes that render their own chrome (app shell) and must hide the public header. */
export const APP_ROUTE_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/chat",
  "/workspace",
  "/settings",
  "/admin",
  "/studio",
  "/agents",
  "/work",
  "/account",
  "/embed",
] as const;

export function hidesPublicHeader(pathname: string): boolean {
  if (pathname === "/") return true; // the landing page renders its own header
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
