export const zookaColors = { blue: "#2E86AB", purple: "#A23B72", ice: "#F8F9FA", navy: "#0B1220", cyan: "#10D4FF" } as const;
export const zookaSlogan = { ar: "تقنية بإيمان، تقدّم بأخلاق", en: "Innovate • Automate • Grow" } as const;
export const zookaType = {
  arabic: '"IBM Plex Sans Arabic", "Cairo", system-ui, sans-serif',
  latin: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;
export const zookaSpace = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96] as const;
export const zookaRadius = { xs: 6, sm: 10, md: 16, lg: 24, pill: 999 } as const;
export type ZookaColor = keyof typeof zookaColors;
