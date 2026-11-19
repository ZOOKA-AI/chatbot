import assert from "node:assert/strict";
import { beforeEach, expect, test, vi } from "vitest";

const { context, billing, list, grant, capture } = vi.hoisted(() => ({
  context: vi.fn(),
  billing: vi.fn(),
  list: vi.fn(),
  grant: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));
vi.mock("@/lib/auth/workspace", () => ({ requireWorkspaceRole: context }));
vi.mock("@/lib/db/queries", () => ({ getWorkspaceBilling: billing }));
vi.mock("@/lib/saas/invoice-tokens", () => ({ grantPaidInvoiceTokens: grant }));
vi.mock("@/lib/saas/stripe", () => ({
  getStripe: () => ({ invoices: { list } }),
}));

import { GET, POST } from "@/app/api/billing/reconcile/route";

function request(origin: string | null = "https://example.test") {
  return new Request("https://example.test/api/billing/reconcile", {
    method: "POST",
    headers: origin === null ? {} : { origin },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  context.mockResolvedValue({
    user: { type: "regular" },
    organizationId: "org_test",
  });
  billing.mockResolvedValue({ subscription: null });
});

test("GET never reads invoices or changes balances", () => {
  const response = GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  expect(context).not.toHaveBeenCalled();
  expect(billing).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
  expect(grant).not.toHaveBeenCalled();
});

test("missing admin authorization and guest reconciliation requests are rejected", async () => {
  // requireWorkspaceRole returns null for unauthenticated users and members.
  for (const value of [null, { user: { type: "guest" }, role: "owner" }]) {
    context.mockResolvedValueOnce(value);
    assert.equal((await POST(request())).status, 403);
  }
  expect(context).toHaveBeenCalledWith("admin");
  expect(billing).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
  expect(grant).not.toHaveBeenCalled();
});

test("missing or cross-origin headers cannot enable reconciliation", async () => {
  for (const origin of [null, "https://other.test"]) {
    assert.equal((await POST(request(origin))).status, 403);
  }
  expect(billing).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
  expect(grant).not.toHaveBeenCalled();
});

test("privileged roles with no billing customer do not read invoices or grant tokens", async () => {
  for (const role of ["admin", "owner"]) {
    context.mockResolvedValueOnce({
      user: { type: "regular" },
      organizationId: "org_test",
      role,
    });
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { checked: 0, results: [] });
  }
  expect(billing).toHaveBeenCalledWith("org_test");
  expect(list).not.toHaveBeenCalled();
  expect(grant).not.toHaveBeenCalled();
});

test("reconciliation failure does not expose private errors", async () => {
  billing.mockResolvedValue({
    subscription: { externalCustomerId: "cus_test" },
  });
  list.mockRejectedValue(new Error("private detail"));
  const response = await POST(request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Reconciliation failed; safe to retry",
  });
  expect(list).toHaveBeenCalledWith({
    limit: 100,
    status: "paid",
    customer: "cus_test",
  });
  expect(grant).not.toHaveBeenCalled();
  expect(capture).toHaveBeenCalledWith(
    new Error("Workspace billing reconciliation failed"),
    { tags: { area: "billing-reconcile" } }
  );
});
