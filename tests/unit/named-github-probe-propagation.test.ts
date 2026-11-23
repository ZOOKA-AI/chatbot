import { describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  credential: ["private", "sample", "value"].join("-"),
}));

vi.mock("@/lib/agents/command-center", () => ({
  createTask: async (input: Record<string, unknown>) => {
    state.created.push(input);
    return { ...input, id: "task-1", status: "pending" };
  },
  getTask: async () => null,
  listTasks: async () => [],
}));
vi.mock("@/lib/agents/commander-scope", () => ({
  withCommanderTenant: (handler: unknown) => handler,
  withCommanderScope: async (_organizationId: string, work: () => Promise<unknown>) => work(),
}));
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => ({ kind: "user", userId: "user-1" }),
  canManage: () => true,
  callerOrganizationId: () => "org-a",
  badRequest: (error: string) => Response.json({ error }, { status: 400 }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("@/lib/agents/worker", () => ({ executionReport: async () => null }));
vi.mock("@/lib/agents/worker-credentials", () => ({
  resolveNamedWorkspaceCredential: async (organizationId: string, name: string) =>
    organizationId === "org-a" && name === "GITHUB_KEY"
      ? { ok: true, token: state.credential, source: "workspace" }
      : { ok: false, error: "credential_missing", detail: "Workspace secret not found." },
  resolveWorkspaceCredential: async () => ({ ok: false, error: "not_connected", detail: "Not connected." }),
  resolvePlatformCredential: () => ({ ok: false, error: "platform_credential_not_enabled", detail: "Disabled." }),
}));

import { POST } from "@/app/api/agents/tasks/route";
import { createCommanderTools } from "@/lib/ai/tools/commander";
import { toolPayloadFor } from "@/lib/agents/tool-payload";
import { githubRepoInspect, githubRepoProbe } from "@/lib/agents/worker-tools/github-inspect";

const payload = { tool: "github_repo_probe" as const, repo: "zooka-ai/chatbot", secretName: "GITHUB_KEY" };
const request = (body: unknown) => new Request("http://localhost/api/agents/tasks", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("named GitHub probe task propagation", () => {
  test("API and chat preserve the declared secret name, not credential fields", async () => {
    const body = { title: "Check access", instruction: "Check access to the repository", payload };
    expect((await POST(request(body))).status).toBe(201);
    expect(state.created.at(-1)).toMatchObject({ organizationId: "org-a", payload });
    expect((await POST(request({ ...body, payload: { ...payload, token: "x" } }))).status).toBe(400);
    expect((await POST(request({ ...body, payload: { ...payload, secretName: "bad-name" } }))).status).toBe(400);

    const chat = createCommanderTools({ organizationId: "org-a", userId: "user-1", canManage: true });
    const result = await chat.createExecutionTask.execute!(
      body, { toolCallId: "probe", messages: [] } as never
    );
    expect(result).toMatchObject({ ok: true, status: "pending" });
    expect(state.created.at(-1)).toMatchObject({ organizationId: "org-a", payload });
  });

  test("scheduler payload reaches the separate probe, without echoing errors or response content", async () => {
    const taskPayload = toolPayloadFor(payload.tool, payload);
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(["Bearer", state.credential].join(" "));
      expect(init?.redirect).toBe("error");
      return Response.json({ description: state.credential });
    }) as unknown as typeof fetch;
    const run = (organizationId: string, fetcher: typeof fetch) => githubRepoProbe.run({
      organizationId, agentId: "agent", payload: taskPayload,
      signal: new AbortController().signal, fetchImpl: fetcher,
    });
    const result = await run("org-a", fetchImpl);
    expect(result).toMatchObject({ ok: true, evidence: { accessible: true } });
    expect(JSON.stringify(result)).not.toContain(state.credential);
    expect((await run("org-b", fetchImpl)).ok).toBe(false);
    expect(JSON.stringify(await run("org-a", async () => { throw new Error(state.credential); }))).not.toContain(state.credential);
    const inspection = await githubRepoInspect.run({
      organizationId: "org-a", agentId: "agent", payload: taskPayload,
      signal: new AbortController().signal, fetchImpl,
    });
    expect(inspection).toMatchObject({ ok: false, error: "named_secret_not_supported" });
  });
});
