import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";

// The outbound guard resolves every hostname before it fetches, because a DNS answer is what an
// operator does not control. These suites use reserved .test names that cannot resolve, so the
// resolver is stubbed to a public address: the guard's checks still run, only DNS becomes
// deterministic and offline.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));


const credentials = {
  baseUrl: "https://n8n.example.test",
  apiKey: "n8n-admin-test-key-value",
};

vi.mock("@/lib/integrations/n8n/store", () => ({
  getN8nCredentials: vi.fn(async () => credentials),
}));

const store = await import("@/lib/integrations/n8n/store");
const { buildN8nAdminOverview, classifyN8nStage } = await import(
  "@/lib/integrations/n8n/admin-overview"
);
const { decideN8nAdminAccess } = await import("@/lib/integrations/n8n/admin-access");
const { adminNavItems, adminNavSectionLabel } = await import("@/lib/navigation/admin-nav");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.mocked(store.getN8nCredentials).mockResolvedValue(credentials);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const workflowsPayload = {
  data: [
    { id: "wf-1", name: "Daily report", active: true, updatedAt: "2026-11-17T09:00:00.000Z" },
    { id: "wf/2", name: "Mirror", active: false, updatedAt: "2026-11-16T09:00:00.000Z" },
  ],
};

const executionsPayload = {
  data: [
    { id: "10", workflowId: "wf-1", status: "success", startedAt: "2026-11-18T02:00:00.000Z", stoppedAt: "2026-11-18T02:00:09.000Z", finished: true },
    { id: "9", workflowId: "wf-1", status: "error", startedAt: "2026-11-18T01:00:00.000Z", stoppedAt: "2026-11-18T01:00:03.000Z", finished: true },
    { id: "8", workflowId: "wf/2", finished: true, startedAt: "2026-11-17T20:00:00.000Z" },
  ],
};

function stubHappyPath() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("/api/v1/workflows")) return jsonResponse(workflowsPayload);
    if (String(url).includes("/api/v1/executions")) return jsonResponse(executionsPayload);
    return jsonResponse({}, 404);
  });
  return calls;
}

describe("n8n admin stage model", () => {
  const now = new Date("2026-11-18T08:00:00.000Z");

  test("never skips a stage", () => {
    assert.equal(
      classifyN8nStage({ configured: false, probeOk: false, activeWorkflows: 0, lastSuccessAt: null, agentWebhookConfigured: false }).stage,
      "not_configured"
    );
    // Stored key but a failed probe is the dangerous case: it must stay at "configured".
    assert.equal(
      classifyN8nStage({ configured: true, probeOk: false, activeWorkflows: 12, lastSuccessAt: now.toISOString(), agentWebhookConfigured: true, now }).stage,
      "configured"
    );
    assert.equal(
      classifyN8nStage({ configured: true, probeOk: true, activeWorkflows: 0, lastSuccessAt: null, agentWebhookConfigured: true, now }).stage,
      "connected"
    );
    assert.equal(
      classifyN8nStage({ configured: true, probeOk: true, activeWorkflows: 3, lastSuccessAt: "2026-11-01T00:00:00.000Z", agentWebhookConfigured: true, now }).stage,
      "connected"
    );
    assert.equal(
      classifyN8nStage({ configured: true, probeOk: true, activeWorkflows: 3, lastSuccessAt: "2026-11-18T07:00:00.000Z", agentWebhookConfigured: false, now }).stage,
      "operational"
    );
    assert.equal(
      classifyN8nStage({ configured: true, probeOk: true, activeWorkflows: 3, lastSuccessAt: "2026-11-18T07:00:00.000Z", agentWebhookConfigured: true, now }).stage,
      "agent_ready"
    );
  });

  test("a future timestamp is not a recent success", () => {
    const result = classifyN8nStage({
      configured: true,
      probeOk: true,
      activeWorkflows: 2,
      lastSuccessAt: "2027-01-01T00:00:00.000Z",
      agentWebhookConfigured: true,
      now,
    });
    assert.equal(result.stage, "connected");
    assert.deepEqual(result.reasons, ["no_recent_successful_execution"]);
  });
});

describe("n8n admin authorization", () => {
  test("ordinary members and non-regular sessions are refused", () => {
    assert.equal(decideN8nAdminAccess(null), "unauthorized");
    assert.equal(decideN8nAdminAccess({ role: "member" }), "forbidden");
    assert.equal(decideN8nAdminAccess({ role: "owner", userType: "guest" }), "unauthorized");
    assert.equal(decideN8nAdminAccess({ role: "owner", userType: "regular" }), "allowed");
    assert.equal(decideN8nAdminAccess({ role: "admin", userType: "regular" }), "allowed");
  });
});

describe("n8n admin overview", () => {
  test("reports not_configured without calling the network", async () => {
    vi.mocked(store.getN8nCredentials).mockResolvedValueOnce(null);
    const calls = stubHappyPath();
    const overview = await buildN8nAdminOverview("org-1");
    assert.equal(overview.stage, "not_configured");
    assert.equal(calls.length, 0);
  });

  test("a rejected key stays configured and never claims a connection", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ message: "unauthorized" }, 401));
    const overview = await buildN8nAdminOverview("org-1");
    assert.equal(overview.stage, "configured");
    assert.equal(overview.probeError, "unauthorized");
    assert.deepEqual(overview.workflows, []);
    assert.match(overview.reasons.join(","), /authenticated_probe_failed/);
  });

  test("reads only through GET, maps deep links, and never leaks the key", async () => {
    const methods: string[] = [];
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { method?: string }) => {
      urls.push(String(url));
      methods.push(String(init?.method ?? "GET"));
      if (String(url).includes("/api/v1/workflows")) return jsonResponse(workflowsPayload);
      return jsonResponse(executionsPayload);
    });

    // The sandbox injects a real .env, so the agent key must be controlled explicitly here rather than
    // read from whatever the machine happens to have.
    vi.stubEnv("AGENT_WEBHOOK_KEY", "");
    vi.stubEnv("SOLAS_AGENT_KEY", "");

    const overview = await buildN8nAdminOverview("org-1", new Date("2026-11-18T08:00:00.000Z"));

    assert.deepEqual([...new Set(methods)], ["GET"]);
    assert.ok(urls.every((url) => url.startsWith("https://n8n.example.test/api/v1/")));
    assert.equal(overview.workflowCount, 2);
    assert.equal(overview.activeWorkflowCount, 1);
    // A workflow is active and a success happened minutes ago, so this is operational but not
    // agent-ready while the webhook key is empty (see stubEnv above).
    assert.equal(overview.stage, "operational");
    assert.equal(overview.lastSuccessAt, "2026-11-18T02:00:09.000Z");
    assert.deepEqual(overview.errors.map((row) => row.id), ["9"]);
    assert.equal(overview.executions.at(-1)?.status, "finished_unknown");
    assert.equal(
      overview.workflows.find((row) => row.id === "wf/2")?.deepLink,
      "https://n8n.example.test/workflow/wf%2F2"
    );
    assert.ok(!JSON.stringify(overview).includes(credentials.apiKey), "the API key must never be serialized");
    assert.ok(!JSON.stringify(overview).includes("encryptedCredentials"));
  });

  test("asks the store for this workspace's credential only", async () => {
    stubHappyPath();
    await buildN8nAdminOverview("org-tenant-a");
    expect(store.getN8nCredentials).toHaveBeenCalledWith("org-tenant-a");
  });
});

describe("n8n admin surface is read-only", () => {
  test("no write verb appears in the overview module or its route", () => {
    const files = [
      "lib/integrations/n8n/admin-overview.ts",
      "app/api/integrations/n8n/admin/overview/route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const verb of ['"POST"', '"PUT"', '"PATCH"', '"DELETE"', "method: 'POST'", "method: 'DELETE'"]) {
        assert.ok(!source.includes(verb), `${file} must not contain ${verb}`);
      }
    }
  });

  test("the API route exports GET and no other HTTP handler", () => {
    const source = readFileSync("app/api/integrations/n8n/admin/overview/route.ts", "utf8");
    const handlers = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)/g)].map((match) => match[1]);
    assert.deepEqual(handlers, ["GET"]);
  });
});
describe("n8n admin navigation", () => {
  test("the entry exists for owners and admins and for nobody else", () => {
    assert.deepEqual(adminNavItems("owner").map((item) => item.href), ["/workspace/admin/n8n"]);
    assert.deepEqual(adminNavItems("admin").map((item) => item.href), ["/workspace/admin/n8n"]);
    assert.deepEqual(adminNavItems("member"), []);
    assert.deepEqual(adminNavItems(null), []);
    assert.deepEqual(adminNavItems(undefined), []);
    assert.equal(adminNavSectionLabel(true), "الإدارة");
    assert.equal(adminNavSectionLabel(false), "Admin");
  });

  test("the sidebar cannot render the item outside that gate", () => {
    const source = readFileSync("components/app-sidebar.tsx", "utf8");
    // The only source of admin items is the tested helper, and it is used behind a length check.
    assert.match(source, /adminNavItems\(role\)/);
    assert.match(source, /if \(adminItems\.length > 0\)/);
    assert.ok(!source.includes('"/workspace/admin/n8n"'), "the href must not be hardcoded in the component");
  });
});

describe("n8n workspace isolation", () => {
  test("two workspaces never see each other's instance or workflows", async () => {
    const perOrg: Record<string, { baseUrl: string; apiKey: string }> = {
      "org-a": { baseUrl: "https://a.n8n.test", apiKey: "key-for-a" },
      "org-b": { baseUrl: "https://b.n8n.test", apiKey: "key-for-b" },
    };
    vi.mocked(store.getN8nCredentials).mockImplementation(async (orgId: string) => perOrg[orgId] ?? null);

    const seen: Array<{ url: string; key: string }> = [];
    vi.stubGlobal("fetch", async (url: string, init: { headers?: Record<string, string> }) => {
      const key = String(init?.headers?.["X-N8N-API-KEY"] ?? "");
      seen.push({ url: String(url), key });
      const host = new URL(String(url)).host;
      if (String(url).includes("/workflows")) {
        return jsonResponse({
          data: [{ id: `wf-${host}`, name: `workflow on ${host}`, active: true, updatedAt: null }],
        });
      }
      return jsonResponse({ data: [] });
    });

    const a = await buildN8nAdminOverview("org-a");
    const b = await buildN8nAdminOverview("org-b");

    assert.deepEqual(a.workflows.map((row) => row.name), ["workflow on a.n8n.test"]);
    assert.deepEqual(b.workflows.map((row) => row.name), ["workflow on b.n8n.test"]);
    assert.ok(a.workflows.every((row) => row.deepLink.startsWith("https://a.n8n.test/")));
    assert.ok(b.workflows.every((row) => row.deepLink.startsWith("https://b.n8n.test/")));
    // No request ever mixed one tenant's host with the other tenant's key.
    for (const call of seen) {
      const expected = call.url.startsWith("https://a.n8n.test") ? "key-for-a" : "key-for-b";
      assert.equal(call.key, expected, `key/host mismatch on ${call.url}`);
    }
  });

  test("a workspace with no credential cannot borrow another", async () => {
    vi.mocked(store.getN8nCredentials).mockImplementation(async (orgId: string) =>
      orgId === "org-a" ? { baseUrl: "https://a.n8n.test", apiKey: "key-for-a" } : null
    );
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      return jsonResponse({ data: [] });
    });
    const empty = await buildN8nAdminOverview("org-c");
    assert.equal(empty.stage, "not_configured");
    assert.equal(calls.length, 0);
  });
});
