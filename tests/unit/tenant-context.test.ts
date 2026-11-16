import { describe, expect, it } from "vitest";
import {
  getTenantScope,
  requireTenantScope,
  runWithTenantStore,
  TenantContextMissingError,
  TenantForbiddenError,
  type TenantScope,
} from "@/lib/db/tenant-context";

const scope: TenantScope = {
  userId: "user-1",
  organizationId: "org-1",
  role: "owner",
  source: "session",
};

describe("tenant context", () => {
  it("has no scope outside a request", () => {
    expect(getTenantScope()).toBeNull();
    expect(() => requireTenantScope()).toThrow(TenantContextMissingError);
  });

  it("exposes the scope only inside the callback", async () => {
    const seen = await runWithTenantStore({ scope, tx: null }, async () => {
      expect(requireTenantScope()).toEqual(scope);
      await Promise.resolve();
      return getTenantScope()?.organizationId;
    });
    expect(seen).toBe("org-1");
    expect(getTenantScope()).toBeNull();
  });

  it("keeps concurrent requests apart", async () => {
    const other: TenantScope = { ...scope, organizationId: "org-2" };
    const run = (s: TenantScope) =>
      runWithTenantStore({ scope: s, tx: null }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return requireTenantScope().organizationId;
      });
    const [a, b] = await Promise.all([run(scope), run(other)]);
    expect([a, b]).toEqual(["org-1", "org-2"]);
  });

  it("surfaces a mismatch as a forbidden error", () => {
    expect(new TenantForbiddenError().name).toBe("TenantForbiddenError");
  });
});
