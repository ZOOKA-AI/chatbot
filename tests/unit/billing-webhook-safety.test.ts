import assert from "node:assert/strict";
import { test, vi } from "vitest";

const { grant, claim, release } = vi.hoisted(() => ({
  grant: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/affiliate", () => ({ recordReferralEvent: vi.fn() }));
vi.mock("@/lib/webhooks/events", () => ({
  claimWebhookEvent: claim,
  releaseWebhookEvent: release,
}));
vi.mock("@/lib/db/queries", () => ({ syncWorkspaceSubscription: vi.fn() }));
vi.mock("@/lib/db/token-wallets", () => ({
  grantTokensForBillingPeriod: grant,
}));
vi.mock("@/lib/saas/plans", () => ({
  getPlanFromStripePriceId: () => "pro",
  workspacePlans: { pro: { price: 19 } },
}));
vi.mock("@/lib/saas/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => ({
        id: "evt-audit",
        type: "invoice.paid",
        data: {
          object: {
            id: "invoice-audit",
            parent: { subscription_details: { subscription: "sub-audit" } },
          },
        },
      }),
    },
    subscriptions: {
      retrieve: async () => ({
        id: "sub-audit",
        customer: "cus-audit",
        status: "active",
        metadata: { organizationId: "audit-org", plan: "pro" },
        items: {
          data: [
            {
              price: { id: "price-audit" },
              current_period_start: 1_793_491_200,
              current_period_end: 1_796_083_200,
            },
          ],
        },
      }),
    },
  }),
  getStripeId: (x: any) => x,
  mapStripeStatus: () => "active",
}));

import { POST } from "@/app/api/stripe/webhook/route";

test("invoice.paid grant failure returns 500 and releases claim so retry can grant", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "test-placeholder");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-placeholder");
  claim.mockResolvedValue(true);
  grant.mockRejectedValue(new Error("simulated wallet outage"));
  try {
    const response = await POST(
      new Request("https://example.test/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "test-placeholder" },
        body: "{}",
      })
    );
    assert.equal(response.status, 500);
    assert.equal(grant.mock.calls.length, 1);
    assert.equal(release.mock.calls.length, 1);
    claim.mockResolvedValue(true);
    grant.mockResolvedValue({ granted: 1_280_000, skipped: null });
    const retry = await POST(
      new Request("https://example.test/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "test-placeholder" },
        body: "{}",
      })
    );
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).received, true);
    assert.equal(grant.mock.calls.length, 2);
  } finally {
    vi.unstubAllEnvs();
  }
});
