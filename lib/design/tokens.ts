/**
 * ZOOKA-AI — Design Tokens (معتمدة 15.11.2026)
 * مصدر واحد للحقيقة البصرية. ممنوع استخدام قيم لونية حرة خارج هذه القائمة.
 * الهوية: Luxury Futuristic AI · «تقنية بإيمان، تقدم بأخلاق» · © 2024–2026 ZOOKA-AI
 */
export const color = {
  royalBlue: "#2E86AB",
  purple: "#A23B72",
  snowWhite: "#F8F9FA",
  // مشتقات الواجهة الداكنة (خلفية عصبية + نيون هادئ)
  neuralBase: "#070B12",
  neuralLayer: "#0C121C",
  surface: "#111925",
  surfaceRaised: "#16202E",
  border: "rgba(46,134,171,0.22)",
  neonSky: "rgba(46,134,171,0.55)",
  neonViolet: "rgba(162,59,114,0.45)",
  textPrimary: "#F8F9FA",
  textMuted: "rgba(248,249,250,0.66)",
  textFaint: "rgba(248,249,250,0.40)",
  success: "#2FA37A",
  warning: "#C99A2E",
  danger: "#C4453B",
} as const;

export const font = {
  arabic: 'var(--font-arabic, "Cairo","Noto Kufi Arabic",system-ui,sans-serif)',
  latin: 'var(--font-latin, "Inter",system-ui,sans-serif)',
} as const;

export const radius = { sm: "8px", md: "12px", lg: "18px", xl: "26px", pill: "999px" } as const;

export const space = { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 7: "48px", 8: "64px" } as const;

export const motion = {
  fast: "140ms",
  base: "220ms",
  slow: "380ms",
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  // حركة ثلاثية الأبعاد خفيفة لا تضر بالأداء
  maxParallaxPx: 6,
} as const;

export const brand = {
  name: "ZOOKA-AI",
  taglineAr: "تقنية بإيمان، تقدم بأخلاق",
  taglineEn: "Technology with faith, progress with ethics",
  founded: 2024,
  copyright: "© 2024–2026 ZOOKA-AI — جميع الحقوق محفوظة",
} as const;
