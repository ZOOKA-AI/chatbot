export const workspacePlans = {
  free: { name: "Free", monthlyMessages: 1000 },
  pro: { name: "Pro", monthlyMessages: 10_000 },
  enterprise: { name: "Enterprise", monthlyMessages: null },
} as const;

export type WorkspacePlan = keyof typeof workspacePlans;
