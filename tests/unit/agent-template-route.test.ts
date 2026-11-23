import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  canManage: vi.fn(),
  callerOrganizationId: vi.fn(),
  createAgentTemplateLink: vi.fn(),
  revokeAgentTemplateLink: vi.fn(),
  getPublicAgentTemplate: vi.fn(),
  copyAgentTemplate: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: h.resolveCaller,
  canManage: h.canManage,
  callerOrganizationId: h.callerOrganizationId,
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/agents/commander-scope", () => ({
  withCommanderTenant: (
    handler: (request: Request, context: unknown) => Promise<Response>
  ) => handler,
  withCommanderScope: (_organizationId: string, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock("@/lib/agents/templates", () => ({
  createAgentTemplateLink: h.createAgentTemplateLink,
  revokeAgentTemplateLink: h.revokeAgentTemplateLink,
  getPublicAgentTemplate: h.getPublicAgentTemplate,
  copyAgentTemplate: h.copyAgentTemplate,
}));
vi.mock("@/lib/auth/workspace", () => ({
  getWorkspaceContext: h.getWorkspaceContext,
}));

import {
  DELETE,
  POST,
} from "@/app/api/agents/registry/[agentId]/template/route";
import {
  POST as copyTemplate,
  GET as previewTemplate,
} from "@/app/api/templates/[token]/route";

const owner = {
  kind: "owner",
  userId: "user-1",
  organizationId: "org-1",
  role: "owner",
};
const context = {
  params: Promise.resolve({ agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
};
const templateContext = { params: Promise.resolve({ token: "A".repeat(43) }) };

afterEach(() => vi.clearAllMocks());

test("only an owner or admin can create or revoke an agent template link", async () => {
  h.resolveCaller.mockResolvedValue(owner);
  h.callerOrganizationId.mockReturnValue("org-1");

  h.canManage.mockReturnValue(false);
  assert.equal(
    (await POST(new Request("https://example.test"), context)).status,
    403
  );
  assert.equal(
    (await DELETE(new Request("https://example.test"), context)).status,
    403
  );
  assert.equal(h.createAgentTemplateLink.mock.calls.length, 0);
  assert.equal(h.revokeAgentTemplateLink.mock.calls.length, 0);

  h.canManage.mockReturnValue(true);
  h.createAgentTemplateLink.mockResolvedValue({ token: "A".repeat(43) });
  h.revokeAgentTemplateLink.mockResolvedValue(true);
  const created = await POST(new Request("https://example.test"), context);
  assert.equal(created.status, 201);
  assert.match((await created.json()).url, /^\/templates\//);

  const revoked = await DELETE(new Request("https://example.test"), context);
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { revoked: true });
  assert.deepEqual(h.createAgentTemplateLink.mock.calls[0][0], {
    organizationId: "org-1",
    agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.deepEqual(h.revokeAgentTemplateLink.mock.calls[0][0], {
    organizationId: "org-1",
    agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
});

test("public preview is readable, but only a workspace owner or admin can copy", async () => {
  const template = { agent: { displayName: "Research agent" }, schedules: [] };
  h.getPublicAgentTemplate.mockResolvedValue(template);
  assert.deepEqual(
    await (
      await previewTemplate(
        new Request("https://example.test"),
        templateContext
      )
    ).json(),
    {
      template,
    }
  );

  h.getWorkspaceContext.mockResolvedValue({
    user: { id: "member-1", type: "regular" },
    organizationId: "org-1",
    role: "member",
  });
  assert.equal(
    (
      await copyTemplate(
        new Request("https://example.test", { method: "POST" }),
        templateContext
      )
    ).status,
    403
  );
  assert.equal(h.copyAgentTemplate.mock.calls.length, 0);

  h.getWorkspaceContext.mockResolvedValue({
    user: { id: "owner-1", type: "regular" },
    organizationId: "org-1",
    role: "owner",
  });
  h.copyAgentTemplate.mockResolvedValue({
    agent: { id: "copy-1", displayName: "Research agent" },
    schedulesCreated: 0,
  });
  const response = await copyTemplate(
    new Request("https://example.test", { method: "POST" }),
    templateContext
  );
  assert.equal(response.status, 201);
  assert.deepEqual(h.copyAgentTemplate.mock.calls[0], [
    "A".repeat(43),
    "org-1",
  ]);
});
