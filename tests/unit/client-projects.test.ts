import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { context, create, list } = vi.hoisted(() => ({
  context: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: context }));
vi.mock("@/lib/db/projects", () => ({
  createProject: create,
  listProjects: list,
}));

import { GET, POST } from "@/app/api/projects/route";

beforeEach(() => {
  context.mockReset();
  create.mockReset();
  list.mockReset();
  context.mockResolvedValue({
    user: { id: "user-a", type: "regular" },
    organizationId: "workspace-a",
  });
});
function request(body: unknown) {
  return new Request("https://app.example.test/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
test("saved project is scoped to the workspace and never returns an unprovisioned URL", async () => {
  create.mockResolvedValueOnce({ id: "project-a", status: "CREATING" });
  const response = await POST(
    request({ name: "My site", subdomain: "my-site" })
  );
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.published, false);
  assert.equal(body.previewUrl, null);
  assert.equal(body.url, undefined);
  assert.equal(create.mock.calls[0]?.[0].organizationId, "workspace-a");
  assert.equal(create.mock.calls[0]?.[0].createdBy, "user-a");
});
test("guest requests cannot create or enumerate client projects", async () => {
  context.mockResolvedValue({ user: { type: "guest" } });
  assert.equal((await GET()).status, 401);
  assert.equal(
    (await POST(request({ name: "My site", subdomain: "my-site" }))).status,
    401
  );
  assert.equal(create.mock.calls.length, 0);
  assert.equal(list.mock.calls.length, 0);
});
test("reserved subdomains and extra fields cannot provision a project", async () => {
  assert.equal(
    (await POST(request({ name: "My site", subdomain: "admin" }))).status,
    409
  );
  assert.equal(
    (
      await POST(
        request({
          name: "My site",
          subdomain: "my-site",
          organizationId: "other",
        })
      )
    ).status,
    400
  );
  assert.equal(create.mock.calls.length, 0);
});

test("missing database result is an error, not a created project", async () => {
  create.mockResolvedValueOnce(undefined);
  const response = await POST(
    request({ name: "My site", subdomain: "my-site" })
  );
  assert.equal(response.status, 500);
});
