/**
 * ZOOKA-AI design tokens — the single source for colour, type, spacing, radius,
 * elevation and motion. Nothing here changes a rendered page on its own: the
 * tokens are exported for components to consume, and the matching CSS variables
 * live in styles/zooka-tokens.css. The two are kept in sync by a unit test, so a
 * component can never reference a variable that does not exist.
 *
 * Identity is fixed by the owner: royal blue #2E86AB, plum #A23B72, snow
 * #F8F9FA, "Luxury Futuristic AI". RTL and LTR must both work, so spacing is
 * expressed as logical values (start/end) and never as left/right.
 */
export const color = {
  brandBlue: "#2E86AB",
  brandPlum: "#A23B72",
  snow: "#F8F9FA",
  /** Deep surface for the neural background. */
  night: "#0B1020",
  nightElevated: "#131A2E",
  /** Text */
  ink: "#0B1020",
  inkMuted: "#5A6478",
  onBrand: "#F8F9FA",
  /** Feedback */
  success: "#1F9D6C",
  warning: "#C8892B",
  danger: "#C0392B",
  /** Lines and overlays */
  border: "rgba(11, 16, 32, 0.10)",
  borderOnDark: "rgba(248, 249, 250, 0.14)",
  glowBlue: "rgba(46, 134, 171, 0.35)",
  glowPlum: "rgba(162, 59, 114, 0.35)",
} as const;

export const gradient = {
  brand: `linear-gradient(135deg, ${color.brandBlue} 0%, ${color.brandPlum} 100%)`,
  neural:
    "radial-gradient(1200px 600px at 15% -10%, rgba(46,134,171,0.28), transparent 60%), radial-gradient(900px 500px at 110% 10%, rgba(162,59,114,0.22), transparent 55%), #0B1020",
} as const;

export const typography = {
  familyLatin:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Roboto, Arial, sans-serif',
  familyArabic:
    '"Cairo", "Noto Kufi Arabic", "Segoe UI", Tahoma, ui-sans-serif, sans-serif',
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.375rem",
    "2xl": "1.75rem",
    "3xl": "2.25rem",
    hero: "3rem",
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.2, snug: 1.35, normal: 1.6, relaxed: 1.75 },
} as const;

/** Logical spacing: inline-start/end resolve correctly in RTL and LTR. */
export const space = {
  "2xs": "0.25rem",
  xs: "0.5rem",
  sm: "0.75rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
  "2xl": "3rem",
  "3xl": "4rem",
} as const;

export const radius = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  pill: "999px",
} as const;

export const elevation = {
  card: "0 1px 2px rgba(11,16,32,0.06), 0 8px 24px rgba(11,16,32,0.06)",
  raised: "0 2px 6px rgba(11,16,32,0.08), 0 18px 48px rgba(11,16,32,0.10)",
  glow: `0 0 0 1px ${color.borderOnDark}, 0 12px 40px ${color.glowBlue}`,
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "320ms",
  easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
} as const;

export const layout = {
  contentMax: "72rem",
  sidebar: "17rem",
  /** Mobile-first breakpoints used across the app. */
  breakpoint: { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem" },
} as const;

export const tokens = {
  color,
  gradient,
  typography,
  space,
  radius,
  elevation,
  motion,
  layout,
} as const;

export type Tokens = typeof tokens;
