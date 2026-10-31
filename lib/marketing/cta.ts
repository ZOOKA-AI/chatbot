/**
 * The only two call-to-action destinations on the marketing site.
 *
 * Three different labels used to point at /register and two at the demo, which
 * made the page look like it had more entry points than it does. Everything now
 * reads from here.
 */
export const CTA = {
  demo: {
    href: "/#demo",
    ar: "جرّب الآن بدون حساب",
    en: "Try now without an account",
  },
  workspace: {
    href: "/register",
    ar: "أنشئ مساحة عملك",
    en: "Create your workspace",
  },
} as const;
