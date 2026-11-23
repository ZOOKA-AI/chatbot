import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runInTenantTransaction = vi.fn(async (_ctx: unknown, work: () => Promise<unknown>) => work());
vi.mock("@/lib/db/tenant-client", () => ({ runInTenantTransaction }));

const resolveCaller = vi.fn();
vi.mock("@/lib/agents/auth", () => ({ resolveCaller }));

vi.mock("@/lib/db/tenant", () => ({
  tenantScopeEnabled: () => true,
  TenantScopeError: class extends Error {},
}));

const { withCommanderScope, withCommanderTenant } = await import("@/lib/agents/commander-scope");

describe("commander tenant scope carries the user", () => {
  beforeEach(() => {
    runInTenantTransaction.mockClear();
    resolveCaller.mockReset();
  });

  it("passes the owner's user id so app_platform_org() can honour the organisation", async () => {
    resolveCaller.mockResolvedValue({ kind: "owner", userId: "u-1", organizationId: "org-1", role: "owner" });
    const handler = withCommanderTenant(async () => new Response("ok"));
    await handler(new Request("https://x.test/api"));
    expect(runInTenantTransaction).toHaveBeenCalledWith(
      { organizationId: "org-1", userId: "u-1" },
      expect.any(Function)
    );
  });

  it("keeps agent callers without a user", async () => {
    resolveCaller.mockResolvedValue({ kind: "agent", agent: { id: "a-1", organizationId: "org-2" } });
    const handler = withCommanderTenant(async () => new Response("ok"));
    await handler(new Request("https://x.test/api"));
    expect(runInTenantTransaction).toHaveBeenCalledWith(
      { organizationId: "org-2", userId: null },
      expect.any(Function)
    );
  });

  it("defaults to no user for scheduler work", async () => {
    await withCommanderScope("org-3", async () => 1);
    expect(runInTenantTransaction).toHaveBeenCalledWith(
      { organizationId: "org-3", userId: null },
      expect.any(Function)
    );
  });
});
