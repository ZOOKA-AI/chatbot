import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  payload: { tool: "github_repo_probe", repo: "zooka-ai/chatbot", secretName: "GITHUB_KEY" } as Record<string, unknown>,
  claimed: 0,
  ran: [] as Array<{ tool: string; payload: Record<string, unknown> }>,
}));
const tool = vi.hoisted(() => (name: string) => ({
  name, readOnly: true, timeoutMs: 1000, maxAttempts: 3,
  run: async ({ payload }: { payload: Record<string, unknown> }) => {
    state.ran.push({ tool: name, payload });
    return { ok: true, summary: "ok", evidence: { done: true } };
  },
}));

vi.mock("@/lib/agents/command-center", () => ({
  getTask: async () => ({ payload: state.payload, status: "pending" }),
  countExecutions: async () => 0,
  claimTask: async () => { state.claimed += 1; return { ok: true }; },
  startExecution: async () => ({ ok: true, execution: { id: "execution-1" } }),
  reportTask: async () => true,
  reportLoadedSkill: async () => true,
  finishExecution: async () => {},
  latestExecution: async () => null,
  authenticateAgent: async () => ({ id: "agent-1", organizationId: "org-a", allowedTools: null }),
  listTasks: async () => [],
}));
vi.mock("@/lib/agents/agent-tools", () => ({
  agentAllowsTool: () => true,
  permissionsRequiringApproval: () => [],
  toolCatalog: () => [{ id: "github_repo_probe" }, { id: "github_repo_inspect" }],
}));
vi.mock("@/lib/agents/commander-scope", () => ({ withCommanderTenant: (handler: unknown) => handler }));
vi.mock("@/lib/agents/worker-lease", () => ({
  HEARTBEAT_MS: 30000,
  heartbeat: async () => true,
  idempotencyKey: () => "idempotency",
  leaseDeadline: () => new Date(),
}));
vi.mock("@/lib/agents/worker-tools/github-inspect", () => ({
  githubRepoInspect: tool("github_repo_inspect"),
  githubRepoProbe: tool("github_repo_probe"),
}));
vi.mock("@/lib/agents/worker-tools/vercel-inspect", () => ({ vercelDeploymentInspect: tool("vercel_deployment_inspect") }));
vi.mock("@/lib/agents/worker-tools/project-document", () => ({ projectDocumentCreate: tool("project_document_create") }));
vi.mock("@/lib/agents/worker-tools/studio-promo", () => ({ studioPromoVideo: tool("studio_promo_video") }));
vi.mock("@/lib/agents/worker-tools/studio-ai-generate", () => ({ studioAiGenerate: tool("studio_ai_generate") }));
vi.mock("@/lib/agents/worker-tools/workspace-readiness", () => ({ workspaceReadinessInspect: tool("workspace_readiness_inspect") }));
vi.mock("@/lib/agents/worker-tools/load-skill", () => ({ loadSkill: tool("load_skill") }));
vi.mock("@/lib/agents/worker-tools/connectors", () => ({
  connectorCatalog: tool("connector_catalog"), connectorLink: tool("connector_link"),
  connectorRead: tool("connector_read"), connectorStatus: tool("connector_status"),
}));
vi.mock("@/lib/agents/worker-tools/browser-task", () => ({ browserTaskRun: tool("browser_task_run") }));
vi.mock("@/lib/agents/worker-tools/studio-media", () => ({
  studioAssetList: tool("studio_asset_list"), studioAudioEdit: tool("studio_audio_edit"),
  studioBackgroundRemove: tool("studio_background_remove"), studioImageEdit: tool("studio_image_edit"),
  studioNarration: tool("studio_narration"), studioVideoRender: tool("studio_video_render"),
}));

import { runTask } from "@/lib/agents/worker";
import { POST } from "@/app/api/agents/worker/route";

const agent = { id: "agent-1", organizationId: "org-a", allowedTools: null };
const taskId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  state.claimed = 0;
  state.ran = [];
  state.payload = { tool: "github_repo_probe", repo: "zooka-ai/chatbot", secretName: "GITHUB_KEY" };
});

describe("stored probe dispatch guard", () => {
  test("worker endpoint rejects tool substitution and never claims the probe", async () => {
    const response = await POST(new Request("http://localhost/api/agents/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, tool: "github_repo_inspect", payload: { repo: "zooka-ai/chatbot" } }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ outcome: { error: "stored_probe_mismatch" } });
    expect(state.claimed).toBe(0);
    expect(state.ran).toEqual([]);
  });

  test("refuses modified, partial and additional payloads before claim", async () => {
    for (const payload of [
      { ...state.payload, secretName: "OTHER" },
      { ...state.payload, repo: "other/repo" },
      { secretName: "GITHUB_KEY" },
      { ...state.payload, extra: true },
    ]) {
      const result = await runTask(agent, { taskId, tool: "github_repo_probe", payload });
      expect(result).toMatchObject({ ok: false, error: "stored_probe_mismatch" });
    }
    expect(state.claimed).toBe(0);
    expect(state.ran).toEqual([]);
  });

  test("uses the stored payload with no override or an equivalent explicit payload", async () => {
    for (const payload of [undefined, { secretName: "GITHUB_KEY", repo: "zooka-ai/chatbot", tool: "github_repo_probe" }]) {
      const result = await runTask(agent, { taskId, tool: "github_repo_probe", payload });
      expect(result).toMatchObject({ ok: true, status: "completed", tool: "github_repo_probe" });
      expect(state.ran.at(-1)).toEqual({ tool: "github_repo_probe", payload: state.payload });
    }
    expect(state.claimed).toBe(2);
  });

  test("malformed stored probes fail closed", async () => {
    state.payload = { ...state.payload, unexpected: true };
    const result = await runTask(agent, { taskId, tool: "github_repo_probe" });
    expect(result).toMatchObject({ ok: false, error: "stored_probe_mismatch" });
    expect(state.claimed).toBe(0);
  });
});
