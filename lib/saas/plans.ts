export const workspacePlans = {
  free: {
    name: "Free",
    price: 0,
    monthlyMessages: 1000,
    monthlyAgentRuns: 0,
    features: ["1,000 messages per month", "Standard models"],
  },
  pro: {
    name: "Pro",
    price: 19,
    monthlyMessages: 10_000,
    monthlyAgentRuns: 500,
    features: [
      "10,000 messages per month",
      "Advanced models",
      "500 agent runs per month",
    ],
  },
  business: {
    name: "Business",
    price: 49,
    monthlyMessages: 100_000,
    monthlyAgentRuns: 5_000,
    features: [
      "100,000 messages per month",
      "5,000 agent runs per month",
      "Team workspaces",
      "Priority support",
    ],
  },
} as const;

export type WorkspacePlan = keyof typeof workspacePlans;

export const paidWorkspacePlans = ["pro", "business"] as const;
export type PaidWorkspacePlan = (typeof paidWorkspacePlans)[number];

export function getStripePriceId(plan: PaidWorkspacePlan) {
  return plan === "pro"
    ? process.env.STRIPE_PRICE_PRO
    : process.env.STRIPE_PRICE_BUSINESS;
}

export function getPlanFromStripePriceId(priceId: string) {
  if (priceId === process.env.STRIPE_PRICE_PRO) {
    return "pro";
  }
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) {
    return "business";
  }
  return null;
}
