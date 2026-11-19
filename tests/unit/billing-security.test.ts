import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  billing: vi.fn(),
  list: vi.fn(),
  retrieve: vi.fn(),
  constructEvent: vi.fn(),
  grant: vi.fn(),
  sync: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.capture }));
vi.mock("@/lib/auth/workspace", () => ({ requireWorkspaceRole: mocks.auth }));
vi.mock("@/lib/db/queries", () => ({
  getWorkspaceBilling: mocks.billing,
  syncWorkspaceSubscription: mocks.sync,
}));
vi.mock("@/lib/affiliate", () => ({ recordReferralEvent: vi.fn() }));
vi.mock("@/lib/db/token-wallets", () => ({
  grantTokensForBillingPeriod: mocks.grant,
}));
vi.mock("@/lib/saas/stripe", () => ({
  getStripe: () => ({
    invoices: { list: mocks.list },
    subscriptions: { retrieve: mocks.retrieve },
    webhooks: { constructEvent: mocks.constructEvent },
  }),
  getStripeId: (value: string | { id: string } | null) =>
    typeof value === "string" ? value : (value?.id ?? null),
  mapStripeStatus: () => "active",
}));

import { GET, POST } from "@/app/api/billing/reconcile/route";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { grantPaidInvoiceTokens } from "@/lib/saas/invoice-tokens";

function fixture() {
  const subscription = {
    id: "sub_one",
    customer: "cus_one",
    status: "active",
    metadata: { organizationId: "org_one", plan: "pro" },
    items: {
      data: [
        {
          price: { id: "price_pro" },
          current_period_start: 9000,
          current_period_end: 10_000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
  const invoice = {
    id: "in_one",
    status: "paid",
    amount_paid: 1900,
    customer: "cus_one",
    parent: { subscription_details: { subscription: "sub_one" } },
    lines: {
      has_more: false,
      data: [
        {
          amount: 1900,
          parent: {
            subscription_item_details: {
              subscription: "sub_one",
              proration: false,
            },
          },
          pricing: { price_details: { price: "price_pro" } },
          period: { start: 1000, end: 2000 },
        },
      ],
    },
  } as unknown as Stripe.Invoice;
  return { invoice, subscription };
}
const request = (origin = "https://example.test") =>
  new Request("https://example.test/api/billing/reconcile", {
    method: "POST",
    headers: { origin },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "unit-test-only");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "unit-test-only");
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
  mocks.auth.mockResolvedValue({
    organizationId: "org_one",
    user: { type: "regular" },
  });
  mocks.billing.mockResolvedValue({
    subscription: { externalCustomerId: "cus_one" },
  });
  mocks.grant.mockResolvedValue({ granted: 1_280_000, skipped: null });
});
test("GET never reads Stripe or mutates wallets", async () => {
  expect(GET().status).toBe(405);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.grant).not.toHaveBeenCalled();
});
test("unauthorized or cross-origin POST cannot reconcile", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(403);
  mocks.auth.mockResolvedValue({
    organizationId: "org_one",
    user: { type: "regular" },
  });
  expect((await POST(request("https://other.test"))).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
});
test("reconciliation is customer and workspace scoped", async () => {
  const { invoice, subscription } = fixture();
  mocks.list.mockResolvedValue({ data: [invoice], has_more: true });
  mocks.retrieve.mockResolvedValue({
    ...subscription,
    metadata: { organizationId: "org_other" },
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({
    limit: 100,
    status: "paid",
    customer: "cus_one",
  });
  expect(mocks.grant).not.toHaveBeenCalled();
  expect((await response.json()).hasMore).toBe(true);
});
test("grants use the invoice's historical period, not the current subscription", async () => {
  const { invoice, subscription } = fixture();
  await grantPaidInvoiceTokens(invoice, subscription);
  expect(mocks.grant).toHaveBeenCalledWith({
    organizationId: "org_one",
    plan: "pro",
    grantKey: "invoice:in_one",
    periodStart: new Date(1_000_000),
    periodEnd: new Date(2_000_000),
  });
});
test("unpaid invoices and proration-only invoices cannot replenish a wallet", async () => {
  const { invoice, subscription } = fixture();
  await grantPaidInvoiceTokens({ ...invoice, status: "open" }, subscription);
  const details = invoice.lines.data[0].parent?.subscription_item_details;
  if (!details) {
    throw new Error("Missing fixture details");
  }
  details.proration = true;
  await grantPaidInvoiceTokens(invoice, subscription);
  expect(mocks.grant).not.toHaveBeenCalled();
});
test("ownership mismatch and unknown prices fail closed", async () => {
  const { invoice, subscription } = fixture();
  await expect(
    grantPaidInvoiceTokens({ ...invoice, customer: "cus_other" }, subscription)
  ).rejects.toThrow("ownership");
  vi.stubEnv("STRIPE_PRICE_PRO", "different_price");
  await expect(grantPaidInvoiceTokens(invoice, subscription)).rejects.toThrow(
    "price"
  );
  expect(mocks.grant).not.toHaveBeenCalled();
});
test("webhook does not acknowledge a failed token grant", async () => {
  const { invoice, subscription } = fixture();
  mocks.constructEvent.mockReturnValue({
    type: "invoice.paid",
    data: { object: invoice },
  });
  mocks.retrieve.mockResolvedValue(subscription);
  mocks.grant.mockRejectedValue(new Error("database unavailable"));
  const response = await webhook(
    new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "fixture" },
      body: "{}",
    })
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Subscription synchronization failed",
  });
});
test("webhook rejects unsigned and invalid signatures before database access", async () => {
  const unsigned = await webhook(
    new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    })
  );
  expect(unsigned.status).toBe(400);
  mocks.constructEvent.mockImplementation(() => {
    throw new Error("invalid");
  });
  expect(
    (
      await webhook(
        new Request("https://example.test/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "bad" },
          body: "{}",
        })
      )
    ).status
  ).toBe(400);
  expect(mocks.grant).not.toHaveBeenCalled();
});

test("locally signed Stripe payload is acknowledged only after a successful grant", async () => {
  const { invoice, subscription } = fixture();
  const signingSecret = randomBytes(32).toString("hex");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", signingSecret);
  const payload = JSON.stringify({
    id: "evt_local",
    object: "event",
    type: "invoice.paid",
    data: { object: invoice },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: signingSecret,
  });
  mocks.constructEvent.mockImplementation(
    (body: string, header: string, secret: string) =>
      Stripe.webhooks.constructEvent(body, header, secret)
  );
  mocks.retrieve.mockResolvedValue(subscription);
  const response = await webhook(
    new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    })
  );
  expect(response.status).toBe(200);
  expect(mocks.grant).toHaveBeenCalledOnce();
  expect(await response.json()).toEqual({ received: true });
});
