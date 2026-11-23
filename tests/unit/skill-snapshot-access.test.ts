import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  caller: null as null | { kind: "owner"; userId: string; organizationId: string; role: string } | { kind: "agent"; agent: { organizationId: string } },
  execution: null as null | { status: string; tool: string },
  evidence: JSON.stringify({ tool: "load_skill", result: { name: "writing", instructions: "Full snapshot" } }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => state.caller,
  callerOrganizationId: (caller: NonNullable<typeof state.caller>) =>
    caller.kind === "owner" ? caller.organizationId : caller.agent.organizationId,
  canManage: () => false,
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => Response.json({ error: "forbidden" }, { status: 403 }),
  badRequest: () => Response.json({ error: "bad_request" }, { status: 400 }),
}));
vi.mock("@/lib/agents/commander-scope", () => ({
  withCommanderTenant: <T,>(handler: T) => handler,
  withCommanderScope: async (_org: string, work: () => Promise<unknown>) => work(),
}));
vi.mock("@/lib/agents/command-center", () => ({
  getTask: async ({ organizationId }: { organizationId: string }) =>
    organizationId === "org-a" ? { id, title: "skill", status: "completed", evidence: state.evidence } : null,
  listTasks: async ({ organizationId }: { organizationId: string }) =>
    organizationId === "org-a" ? [{ id, evidence: state.evidence }] : [],
  listTaskPage: async ({ organizationId }: { organizationId: string }) => ({
    tasks: organizationId === "org-a" ? [{ id, evidence: state.evidence }] : [],
    nextCursor: null,
  }),
  createTask: async () => null,
  cancelTask: async () => null,
}));
vi.mock("@/lib/agents/worker", () => ({
  executionReport: async () => state.execution,
}));

import { GET as detailGET } from "@/app/api/agents/tasks/[id]/route";
import { GET as listGET } from "@/app/api/agents/tasks/route";
import { createCommanderTools } from "@/lib/ai/tools/commander";

const id = "11111111-1111-4111-8111-111111111111";
const request = (query = "") => new Request(`https://example.test/api/agents/tasks${query}`);
const detail = () => detailGET(request(), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.caller = { kind: "owner", userId: "user-a", organizationId: "org-a", role: "member" };
  state.execution = { status: "succeeded", tool: "load_skill" };
  state.evidence = JSON.stringify({ tool: "load_skill", result: { name: "writing", instructions: "Full snapshot" } });
});

describe("skill snapshot access", () => {
  test("a workspace member receives the snapshot from task detail and chat status", async () => {
    expect((await (await detail()).json()).skillSnapshot).toEqual({ name: "writing", instructions: "Full snapshot" });
    const result = await createCommanderTools({ organizationId: "org-a", userId: "user-a", canManage: false })
      .getExecutionStatus.execute!({ taskId: id }, { toolCallId: "call", messages: [] });
    expect(result).toMatchObject({ skillSnapshot: { name: "writing", instructions: "Full snapshot" } });
  });

  test("agent-key detail and list responses do not reveal snapshots", async () => {
    state.caller = { kind: "agent", agent: { organizationId: "org-a" } };
    expect((await (await detail()).json()).skillSnapshot).toBeUndefined();
    for (const query of ["", "?paginate=1"]) {
      expect((await (await listGET(request(query))).json()).tasks[0].evidence).toBeNull();
    }
    state.evidence = "unrelated evidence";
    expect((await (await listGET(request())).json()).tasks[0].evidence).toBe("unrelated evidence");
  });

  test("another workspace cannot access the task through either surface", async () => {
    state.caller = { kind: "owner", userId: "user-b", organizationId: "org-b", role: "member" };
    expect((await detail()).status).toBe(404);
    const result = await createCommanderTools({ organizationId: "org-b", userId: "user-b", canManage: false })
      .getExecutionStatus.execute!({ taskId: id }, { toolCallId: "call", messages: [] });
    expect(result).toMatchObject({ ok: false });
  });

  test("only the latest successful load_skill execution exposes the snapshot", async () => {
    for (const execution of [null, { status: "failed", tool: "load_skill" }, { status: "succeeded", tool: "other" }]) {
      state.execution = execution;
      expect((await (await detail()).json()).skillSnapshot).toBeUndefined();
      const result = await createCommanderTools({ organizationId: "org-a", userId: "user-a", canManage: false })
        .getExecutionStatus.execute!({ taskId: id }, { toolCallId: "call", messages: [] });
      expect(result).not.toHaveProperty("skillSnapshot");
    }
  });
});
