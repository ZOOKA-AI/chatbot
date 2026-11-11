import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { context } = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: context }));

import { GET, POST } from "@/app/api/billing/reconcile/route";

beforeEach(() => {
  context.mockReset();
});
test("GET never reads invoices or changes balances", async () => {
  const response = GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(context.mock.calls.length, 0);
});
test("unauthenticated and guest reconciliation requests are rejected", async () => {
  for (const value of [null, { user: { type: "guest" }, role: "owner" }]) {
    context.mockResolvedValueOnce(value);
    assert.equal((await POST()).status, 401);
  }
});
test("members cannot reconcile and privileged roles cannot enable unsafe writes", async () => {
  context.mockResolvedValueOnce({ user: { type: "regular" }, role: "member" });
  assert.equal((await POST()).status, 403);
  for (const role of ["admin", "owner"]) {
    context.mockResolvedValueOnce({ user: { type: "regular" }, role });
    assert.equal((await POST()).status, 503);
  }
});
test("authorization failure does not expose private errors", async () => {
  context.mockRejectedValueOnce(new Error("private detail"));
  const response = await POST();
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("private detail"), false);
});
