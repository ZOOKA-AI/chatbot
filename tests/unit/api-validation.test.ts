import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";
import { z } from "zod";

/**
 * Input validation on the agent API, exercised through the real handlers.
 *
 * The rules under test are the ones that were missing: a body is a shape, a
 * number is a range, a length is a limit, an unexpected field is refused, and a
 * repeated query key is not a guess. Each failure must answer in the shape the
 * route already used, so nothing downstream breaks.
 */

const mocks = vi.hoisted(() => ({
  caller: null as unknown,
  createTask: vi.fn(),
  listTasks: vi.fn(),
  claimTask: vi.fn(),
  reportTask: vi.fn(),
  listDecisions: vi.fn(),
  recordDecision: vi.fn(),
  requestApproval: vi.fn(),
  registerAgent: vi.fn(),
  listAgents: vi.fn(),
  listDeployments: vi.fn(),
  recordDeployment: vi.fn(),
}));

/**
 * The real auth module cannot be imported here: it reaches next-auth, which this
 * sandbox cannot resolve. These are the four response helpers copied verbatim
 * from lib/agents/auth.ts, and a test below reads that file to prove the copy
 * still matches, so the assertions stay about the real contract.
 */
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => mocks.caller,
  json: (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "cache-control": "no-store" } }),
  unauthorized: () =>
    Response.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: (reason: string) =>
    Response.json({ error: "forbidden", reason }, { status: 403 }),
  badRequest: (reason: string) =>
    Response.json({ error: "bad_request", reason }, { status: 400 }),
  canManage: (caller: { kind: string; role?: string }) =>
    caller.kind === "owner" && (caller.role === "owner" || caller.role === "admin"),
  callerOrganizationId: (caller: { kind: string; organizationId?: string }) =>
    caller.kind === "agent"
      ? (caller as unknown as { agent: { organizationId: string } }).agent.organizationId
      : caller.organizationId,
}));

vi.mock("@/lib/agents/command-center", () => ({
  AGENT_SCOPES: [
    "task:read",
    "task:claim",
    "task:report",
    "decision:write",
    "approval:request",
    "deployment:write",
    "heartbeat",
  ],
  hasScope: (agent: { scopes: string[] }, scope: string) =>
    Array.isArray(agent.scopes) && agent.scopes.includes(scope),
  createTask: mocks.createTask,
  listTasks: mocks.listTasks,
  listTaskPage: async (...a: unknown[]) => ({
    tasks: await (mocks.listTasks as (...x: unknown[]) => Promise<unknown[]>)(...a),
    nextCursor: null,
  }),
  claimTask: mocks.claimTask,
  reportTask: mocks.reportTask,
  listDecisions: mocks.listDecisions,
  recordDecision: mocks.recordDecision,
  requestApproval: mocks.requestApproval,
  registerAgent: mocks.registerAgent,
  listAgents: mocks.listAgents,
  listDeployments: mocks.listDeployments,
  recordDeployment: mocks.recordDeployment,
}));

vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validate, validateParam, validateQuery } from "@/lib/validation/api";

const OWNER = {
  kind: "owner" as const,
  userId: "user-1",
  organizationId: "org-alpha",
  role: "owner",
};
const AGENT = {
  kind: "agent" as const,
  agent: {
    id: "agent-1",
    organizationId: "org-alpha",
    slug: "worker",
    displayName: "Worker",
    role: "worker",
    scopes: ["task:claim", "task:report", "approval:request"],
    environment: "production",
    status: "active",
    lastSeenAt: null,
  },
};
const TASK_ID = "3f6a1d2e-4b5c-4d7e-8f90-1a2b3c4d5e6f";

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://zooka.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(url: string) {
  return new Request(`https://zooka.test${url}`);
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.caller = OWNER;
  for (const fn of Object.values(mocks) as Array<{ mockReset?: () => void }>) {
    fn.mockReset?.();
  }
  mocks.createTask.mockResolvedValue({ id: TASK_ID, title: "t" });
  mocks.listTasks.mockResolvedValue([]);
  mocks.listDecisions.mockResolvedValue([]);
  mocks.listDeployments.mockResolvedValue([]);
  mocks.listAgents.mockResolvedValue([]);
});

test("the response helpers mocked above still match lib/agents/auth.ts", () => {
  const source = readFileSync(join(process.cwd(), "lib/agents/auth.ts"), "utf8");
  assert.match(source, /\{ error: "bad_request", reason \}/);
  assert.match(source, /\{ error: "forbidden", reason \}/);
  assert.match(source, /\{ error: "unauthorized" \}/);
  assert.match(source, /caller\.role === "owner" \|\| caller\.role === "admin"/);
  assert.match(source, /cache-control": "no-store"/);
});

describe("the validation primitives", () => {
  test("an unexpected field is refused, not dropped", () => {
    const schema = z.object({ title: z.string().max(10) }).strict();
    assert.equal(validate(schema, { title: "ok" }).ok, true);
    const extra = validate(schema, { title: "ok", isAdmin: true });
    assert.equal(extra.ok, false);
    assert.equal(extra.ok === false && extra.reason, "invalid_body");
  });

  test("lengths and ranges are enforced", () => {
    const schema = z.object({
      name: z.string().min(1).max(5),
      limit: z.coerce.number().int().min(1).max(200),
    });
    assert.equal(validate(schema, { name: "abcde", limit: "200" }).ok, true);
    assert.equal(validate(schema, { name: "abcdef", limit: "1" }).ok, false);
    assert.equal(validate(schema, { name: "a", limit: "201" }).ok, false);
    assert.equal(validate(schema, { name: "a", limit: "1.5" }).ok, false);
    assert.equal(validate(schema, { name: "a", limit: "abc" }).ok, false);
  });

  test("a repeated query key is refused instead of guessed", () => {
    const schema = z.object({ limit: z.coerce.number().optional() }).strict();
    const request = get("/api/x?limit=10&limit=200");
    const result = validateQuery(request, schema);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.detail, "limit: repeated");
  });

  test("a path parameter is validated like anything else", () => {
    const schema = z.string().regex(/^[a-z0-9]{4,12}$/);
    assert.equal(validateParam("abc123", schema, "code").ok, true);
    assert.equal(validateParam("ABC", schema, "code").ok, false);
    assert.equal(validateParam(undefined, schema, "code").ok, false);
    assert.equal(validateParam("x".repeat(50), schema, "code").ok, false);
  });

  test("a reported failure names the field and the rule, never the value", () => {
    const schema = z.object({ secret: z.string().max(3) }).strict();
    const result = validate(schema, { secret: "hunter2" });
    assert.equal(result.ok, false);
    const detail = result.ok === false ? result.detail : "";
    assert.match(detail, /secret: too_big/);
    assert.ok(!detail.includes("hunter2"));
  });
});

describe("POST /api/agents/tasks", () => {
  test("malformed JSON, missing fields, wrong types and unknown fields all answer 400", async () => {
    const { POST } = await import("@/app/api/agents/tasks/route");
    const cases: [string, unknown, string][] = [
      ["not json at all", "{oops", "invalid_json"],
      ["empty body", {}, "invalid_body"],
      ["title only", { title: "do it" }, "invalid_body"],
      ["title is a number", { title: 42, instruction: "x" }, "invalid_body"],
      ["instruction too long", { title: "t", instruction: "x".repeat(8001) }, "invalid_body"],
      ["title too long", { title: "t".repeat(201), instruction: "x" }, "invalid_body"],
      ["unknown field", { title: "t", instruction: "x", isAdmin: true }, "invalid_body"],
      ["bad priority", { title: "t", instruction: "x", priority: "urgent" }, "invalid_body"],
      ["ownerAgentId not an id", { title: "t", instruction: "x", ownerAgentId: "a".repeat(200) }, "invalid_body"],
      ["too many dependencies", { title: "t", instruction: "x", dependencies: Array(51).fill("d") }, "invalid_body"],
    ];
    for (const [label, body, reason] of cases) {
      const response = await POST(post("/api/agents/tasks", body));
      assert.equal(response.status, 400, label);
      const payload = await bodyOf(response);
      assert.equal(payload.error, "bad_request", label);
      assert.equal(payload.reason, reason, label);
    }
    assert.equal(mocks.createTask.mock.calls.length, 0, "nothing was written");
  });

  test("a valid body passes and carries the caller's organisation", async () => {
    const { POST } = await import("@/app/api/agents/tasks/route");
    const response = await POST(
      post("/api/agents/tasks", {
        title: "rotate the key",
        instruction: "step one ... step two",
        priority: "high",
      })
    );
    assert.equal(response.status, 201);
    const [args] = mocks.createTask.mock.calls[0];
    assert.equal(args.organizationId, "org-alpha");
    assert.equal(args.priority, "high");
    assert.deepEqual(args.dependencies, []);
  });

  test("an agent key cannot create tasks at all", async () => {
    mocks.caller = AGENT;
    const { POST } = await import("@/app/api/agents/tasks/route");
    const response = await POST(post("/api/agents/tasks", { title: "t", instruction: "x" }));
    assert.equal(response.status, 400);
    assert.equal((await bodyOf(response)).reason, "owner_or_admin_required");
    assert.equal(mocks.createTask.mock.calls.length, 0);
  });
});

describe("GET /api/agents/tasks", () => {
  test("the query is parsed: NaN, out of range and unknown filters are refused", async () => {
    const { GET } = await import("@/app/api/agents/tasks/route");
    for (const query of ["limit=abc", "limit=0", "limit=100000", "limit=-5", "status=done", "available=yes", "tenant=x"]) {
      const response = await GET(get(`/api/agents/tasks?${query}`));
      assert.equal(response.status, 400, query);
      assert.equal((await bodyOf(response)).reason, "invalid_query", query);
    }
    assert.equal(mocks.listTasks.mock.calls.length, 0);
  });

  test("a valid query reaches the store scoped to the caller", async () => {
    const { GET } = await import("@/app/api/agents/tasks/route");
    const response = await GET(get("/api/agents/tasks?limit=25&available=true"));
    assert.equal(response.status, 200);
    const [args] = mocks.listTasks.mock.calls[0];
    assert.equal(args.limit, 25);
    assert.equal(args.available, true);
    assert.equal(args.organizationId, "org-alpha");
  });
});

describe("POST /api/agents/tasks/report", () => {
  test("a task id must be a uuid and the status must be a reportable one", async () => {
    mocks.caller = AGENT;
    const { POST } = await import("@/app/api/agents/tasks/report/route");
    for (const body of [
      { taskId: "not-a-uuid", status: "completed", evidence: "done" },
      { taskId: TASK_ID, status: "pending", evidence: "done" },
      { taskId: TASK_ID, status: "completed", evidence: "" },
      { taskId: TASK_ID, status: "completed", evidence: "x".repeat(8001) },
      { taskId: TASK_ID, status: "completed", evidence: "done", extra: 1 },
    ]) {
      const response = await POST(post("/api/agents/tasks/report", body));
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(mocks.reportTask.mock.calls.length, 0);
  });

  test("reporting a task the caller does not own is 403, not 400", async () => {
    mocks.caller = AGENT;
    mocks.reportTask.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/tasks/report/route");
    const response = await POST(
      post("/api/agents/tasks/report", {
        taskId: TASK_ID,
        status: "completed",
        evidence: "done",
      })
    );
    assert.equal(response.status, 403);
    // Deliberately one answer for "not yours" and "gated task without approval":
    // the agent is never told which of the two it hit.
    assert.equal((await bodyOf(response)).error, "task_not_reportable");
  });
});

describe("POST /api/agents/registry", () => {
  test("slug, name and scope list are constrained", async () => {
    const { POST } = await import("@/app/api/agents/registry/route");
    for (const body of [
      { slug: "Bad Slug", displayName: "x", role: "worker" },
      { slug: "ok-slug", displayName: "", role: "worker" },
      { slug: "ok-slug", displayName: "x", role: "w" },
      { slug: "ok-slug", displayName: "x", role: "worker", scopes: ["task:read", "admin:everything"] },
      { slug: "ok-slug", displayName: "x", role: "worker", environment: "staging" },
      { slug: "ok-slug", displayName: "x", role: "worker", isAdmin: true },
    ]) {
      const response = await POST(post("/api/agents/registry", body));
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    assert.equal(mocks.registerAgent.mock.calls.length, 0);
  });
});

describe("limits on the read endpoints", () => {
  test("decisions and deployments refuse a bad limit", async () => {
    const decisions = await import("@/app/api/agents/decisions/route");
    const deployments = await import("@/app/api/agents/deployments/route");
    for (const handler of [decisions.GET, deployments.GET]) {
      const response = await handler(get("/api/agents/x?limit=999"));
      assert.equal(response.status, 400);
      assert.equal((await bodyOf(response)).reason, "invalid_query");
    }
  });
});

describe("POST /api/agents/approvals/request", () => {
  test("an approval needs a real reason and a uuid task", async () => {
    mocks.caller = AGENT;
    const { POST } = await import("@/app/api/agents/approvals/request/route");
    for (const body of [
      { reason: "no" },
      { reason: "x".repeat(4001) },
      { reason: "please approve", taskId: "abc" },
      { reason: "please approve", taskId: TASK_ID, scope: "everything" },
    ]) {
      const response = await POST(post("/api/agents/approvals/request", body));
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 50));
    }
    assert.equal(mocks.requestApproval.mock.calls.length, 0);
  });
});
