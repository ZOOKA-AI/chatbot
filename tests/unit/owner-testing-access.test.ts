import { beforeEach, describe, expect, test, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getWorkspaceOwnerId: vi.fn(),
  getUserEmailById: vi.fn(),
  getWorkspaceBilling: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => queries);
vi.mock("@/lib/billing/launch-program", () => ({
  isLaunchProgramOpen: () => false,
  hasLaunchSlot: async () => false,
}));

import {
  isOwnerTestingEmail,
  ownerTestingEmails,
} from "@/lib/billing/owner-testing";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

describe("owner testing allowlist", () => {
  test("is off when the variable is missing or empty", () => {
    expect(ownerTestingEmails({}).size).toBe(0);
    expect(ownerTestingEmails({ OWNER_TESTING_EMAILS: "  " }).size).toBe(0);
    expect(isOwnerTestingEmail("owner@zooka-ai.com", {})).toBe(false);
  });

  test("matches listed addresses case-insensitively, any separator", () => {
    const env = { OWNER_TESTING_EMAILS: " Owner@Zooka-AI.com, second@x.io;third@y.io " };
    expect(isOwnerTestingEmail("owner@zooka-ai.com", env)).toBe(true);
    expect(isOwnerTestingEmail("THIRD@y.io", env)).toBe(true);
    expect(isOwnerTestingEmail("other@zooka-ai.com", env)).toBe(false);
    expect(isOwnerTestingEmail(null, env)).toBe(false);
  });

  test("ignores entries that are not addresses", () => {
    expect([...ownerTestingEmails({ OWNER_TESTING_EMAILS: "on, yes, a@b.co" })]).toEqual(["a@b.co"]);
  });
});

describe("entitlements", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    queries.getWorkspaceOwnerId.mockResolvedValue("user-1");
    queries.getUserEmailById.mockResolvedValue("owner@zooka-ai.com");
    queries.getWorkspaceBilling.mockResolvedValue({ subscription: null, usage: { agentRuns: 0 } });
  });

  test("a listed owner gets Agent mode without a subscription", async () => {
    vi.stubEnv("OWNER_TESTING_EMAILS", "owner@zooka-ai.com");
    const result = await getWorkspaceEntitlements("org-1");
    expect(result.canUseAgentMode).toBe(true);
    expect(result.plan).toBe("business");
  });

  test("an unlisted owner stays on the free plan", async () => {
    vi.stubEnv("OWNER_TESTING_EMAILS", "someone-else@zooka-ai.com");
    const result = await getWorkspaceEntitlements("org-1");
    expect(result.canUseAgentMode).toBe(false);
    expect(result.plan).toBe("free");
  });

  test("with the variable empty the owner's email is never looked up", async () => {
    vi.stubEnv("OWNER_TESTING_EMAILS", "");
    const result = await getWorkspaceEntitlements("org-1");
    expect(result.canUseAgentMode).toBe(false);
    expect(queries.getUserEmailById).not.toHaveBeenCalled();
  });
});
