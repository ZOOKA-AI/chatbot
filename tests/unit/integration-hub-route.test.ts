import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  context: vi.fn(),
  read: vi.fn(),
  test: vi.fn(),
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: m.context }));
vi.mock("@/lib/integration-hub/server", () => ({
  readHub: m.read,
  testHub: m.test,
}));

import { GET, POST } from "@/app/api/integration-hub/route";

beforeEach(() => {
  vi.resetAllMocks();
  m.context.mockResolvedValue({
    organizationId: "own-workspace",
    role: "admin",
    user: { type: "regular" },
  });
  m.read.mockResolvedValue([]);
  m.test.mockResolvedValue({ state: "VERIFIED", code: "READ_OK" });
});
const request = (body: unknown, origin = "https://example.test") =>
  new Request("https://example.test/api/integration-hub", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("requires sign-in, regular user, admin role and same-origin for tests", async () => {
  m.context.mockResolvedValueOnce(null);
  expect((await GET()).status).toBe(401);
  m.context.mockResolvedValueOnce({ user: { type: "guest" } });
  expect((await POST(request({ provider: "github" }))).status).toBe(401);
  m.context.mockResolvedValueOnce({
    user: { type: "regular" },
    role: "member",
  });
  expect((await POST(request({ provider: "github" }))).status).toBe(403);
  expect(
    (await POST(request({ provider: "github" }, "https://evil.test"))).status
  ).toBe(403);
  expect(m.test).not.toHaveBeenCalled();
});
test("workspace always comes from session; unknown fields, unimplemented probes and database failures fail closed", async () => {
  expect(
    (await POST(request({ provider: "github", organizationId: "other" })))
      .status
  ).toBe(400);
  expect((await POST(request({ provider: "instagram" }))).status).toBe(422);
  expect((await POST(request({ provider: "github" }))).status).toBe(200);
  expect(m.test).toHaveBeenCalledWith("own-workspace", "github");
  m.read.mockRejectedValueOnce(new Error("secret connection URL"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
