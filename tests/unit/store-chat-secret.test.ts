import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/workspace-secrets", () => ({ createWorkspaceSecret: create }));
import { storeChatSecret } from "@/lib/ai/store-chat-secret";

beforeEach(() => create.mockReset());

describe("chat secret vault storage", () => {
  it("retries conflicts with unique workspace-scoped names", async () => {
    create.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "created" });
    const name = await storeChatSecret("org", "user", "GITHUB_TOKEN", "value");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({ organizationId: "org", createdBy: "user", value: "value" });
    expect(create.mock.calls[0][0].name).not.toBe(name);
    expect(create.mock.calls[1][0].name).toBe(name);
    expect(name).toMatch(/^GITHUB_TOKEN_[A-F0-9]{32}$/);
  });

  it("fails closed after repeated conflicts", async () => {
    create.mockResolvedValue(null);
    await expect(storeChatSecret("org", "user", "KEY", "value")).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("uses different names for concurrent requests", async () => {
    create.mockResolvedValue({ id: "created" });
    const names = await Promise.all(Array.from({ length: 20 }, () =>
      storeChatSecret("org", "user", "KEY", "value"),
    ));
    expect(new Set(names).size).toBe(names.length);
  });
});
