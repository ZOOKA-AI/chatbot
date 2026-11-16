import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { assessUrl, loopbackAllowed } from "@/lib/browser/url-policy";
import * as schema from "@/lib/db/schema";

/**
 * Browser sessions: what may be reached, and who may touch them.
 *
 * Two separate questions are tested without a browser. The URL policy decides whether a browser may
 * be pointed somewhere, and the lifecycle decides whether this caller may act on this session. Both
 * are places where a plausible-looking implementation leaks: a policy that trusts the hostname is
 * defeated by a name that resolves inwards, and a lifecycle that trusts the route is defeated by an
 * id from another workspace.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

// The runtime is replaced so these tests exercise the state machine, not Chromium. A real launch is
// covered by the acceptance run.
vi.mock("@/lib/browser/runtime", () => ({
  browserRuntime: () => ({
    open: async () => ({ ok: true }),
    close: async () => undefined,
    has: () => false,
    version: () => "test",
    navigate: async () => ({ ok: true, url: "https://example.com/", title: "Example", status: 200 }),
    screenshot: async () => ({ ok: false, code: "not_running", message: "test" }),
  }),
}));

import {
  agentMayAct,
  BrowserControlError,
  canControl,
  controlSession,
  createSession,
  expireDueSessions,
  getSession,
  listSessions,
  nextStatus,
  type Caller,
} from "@/lib/browser/sessions";

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const OWNER = "owner-1";
const STRANGER = "owner-2";
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

const ownerA: Caller = { userId: OWNER, organizationId: ORG_A, role: "owner" };
const strangerA: Caller = { userId: STRANGER, organizationId: ORG_A, role: "member" };
const ownerB: Caller = { userId: "owner-b", organizationId: ORG_B, role: "owner" };

let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  for (const file of [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0033_decision_audit_uniqueness.sql",
    "pending/0038_schedule_and_agent_model.sql",
    "pending/0040_agent_tools_and_instructions.sql",
    "pending/0041_workspace_projects.sql",
    "pending/0042_project_documents.sql",
    "pending/0043_browser_sessions.sql",
  ]) {
    for (const part of readFileSync(join(process.cwd(), "lib/db/migrations", file), "utf8").split("--> statement-breakpoint")) {
      if (part.trim()) await pg.exec(part);
    }
  }
  holder.db = drizzle(pg, { schema });
  await pg.query(
    `insert into "AgentProject"(id,"organizationId",name) values ($1,'org-alpha','A'), ($2,'org-beta','B')`,
    [PROJECT_A, PROJECT_B]
  );
});

afterEach(async () => {
  await pg.close();
});

describe("what the browser may reach", () => {
  const publicDns = async () => ["93.184.216.34"];

  test("a normal public site is allowed", async () => {
    const result = await assessUrl("https://example.com/path?q=1", { resolve: publicDns });
    assert.equal(result.ok, true);
  });

  test("cloud metadata is refused, which is the whole point of the policy", async () => {
    const literal = await assessUrl("http://169.254.169.254/latest/meta-data/");
    assert.equal(literal.ok, false);
    if (!literal.ok) assert.equal(literal.reason, "private_address");

    // The same target hidden behind a name: the URL looks public, the answer is not.
    const disguised = await assessUrl("https://metadata.internal.example.com/", {
      resolve: async () => ["169.254.169.254"],
    });
    assert.equal(disguised.ok, false);
    if (!disguised.ok) assert.equal(disguised.reason, "private_address");
  });

  test("private and loopback addresses are refused", async () => {
    for (const url of [
      "http://127.0.0.1:5432/",
      "http://localhost/",
      "http://10.0.0.4/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://[::1]/",
      "http://100.64.0.1/",
    ]) {
      const result = await assessUrl(url);
      assert.equal(result.ok, false, `${url} should be refused`);
    }
  });

  test("a name answering with a public and a private address is refused", async () => {
    const result = await assessUrl("https://mixed.example.com/", {
      resolve: async () => ["93.184.216.34", "127.0.0.1"],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "private_address");
  });

  test("other protocols, credentialed URLs and internal suffixes are refused", async () => {
    for (const [url, reason] of [
      ["file:///etc/passwd", "protocol_not_allowed"],
      ["ftp://example.com/x", "protocol_not_allowed"],
      ["https://user:pass@example.com/", "credentials_in_url"],
      ["https://service.internal/", "host_not_allowed"],
      ["not a url", "invalid_url"],
      ["", "empty_url"],
    ] as const) {
      const result = await assessUrl(url);
      assert.equal(result.ok, false, `${url} should be refused`);
      if (!result.ok) assert.equal(result.reason, reason);
    }
  });

  test("loopback needs a named port and an explicit acknowledgement, and never in a deployment", () => {
    const ack = { BROWSER_ALLOW_LOOPBACK: "4517", BROWSER_LOOPBACK_ACKNOWLEDGED: "1" };
    assert.equal(loopbackAllowed("4517", ack), true);
    assert.equal(loopbackAllowed("4518", ack), false, "only the named port");
    assert.equal(loopbackAllowed("4517", { BROWSER_ALLOW_LOOPBACK: "4517" }), false, "no acknowledgement, no loopback");
    assert.equal(loopbackAllowed("4517", { ...ack, VERCEL_ENV: "production" }), false, "not on Vercel production");
    assert.equal(loopbackAllowed("4517", { ...ack, ZOOKA_ENV: "production" }), false, "not in a declared production");
    assert.equal(loopbackAllowed("4517", { ...ack, VERCEL_ENV: "preview" }), true, "a preview may run against a local site");
  });

  test("a DNS failure is a refusal, not an attempt", async () => {
    const result = await assessUrl("https://does-not-exist.example/", {
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "dns_lookup_failed");
  });
});

describe("who may control a session", () => {
  test("the lifecycle only allows the transitions it declares", () => {
    assert.equal(nextStatus("created", "start"), "ready");
    assert.equal(nextStatus("ready", "start"), null);
    assert.equal(nextStatus("running", "pause"), "paused");
    assert.equal(nextStatus("paused", "resume"), "running");
    assert.equal(nextStatus("ready", "take_over"), "taken_over");
    assert.equal(nextStatus("taken_over", "return_control"), "running");
    assert.equal(nextStatus("stopped", "resume"), null, "a stopped session cannot be resumed");
    assert.equal(nextStatus("expired", "start"), null);
  });

  test("the agent is stopped by pause, take-over, expiry and every ending", () => {
    const future = new Date(Date.now() + 600_000);
    assert.deepEqual(agentMayAct({ status: "running", controlHolder: "agent", expiresAt: future }), { ok: true });
    assert.deepEqual(agentMayAct({ status: "ready", controlHolder: "agent", expiresAt: future }), { ok: true });
    assert.deepEqual(agentMayAct({ status: "paused", controlHolder: "agent", expiresAt: future }), {
      ok: false,
      reason: "session_paused",
    });
    assert.deepEqual(agentMayAct({ status: "taken_over", controlHolder: "human", expiresAt: future }), {
      ok: false,
      reason: "human_has_control",
    });
    assert.deepEqual(agentMayAct({ status: "stopped", controlHolder: "agent", expiresAt: future }), {
      ok: false,
      reason: "session_ended",
    });
    assert.deepEqual(agentMayAct({ status: "running", controlHolder: "agent", expiresAt: new Date(Date.now() - 1) }), {
      ok: false,
      reason: "session_expired",
    });
  });

  test("ownership is the session owner, or an owner/admin of the workspace", () => {
    assert.equal(canControl({ ownerId: OWNER }, ownerA), true);
    assert.equal(canControl({ ownerId: OWNER }, strangerA), false);
    assert.equal(canControl({ ownerId: OWNER }, { ...strangerA, role: "admin" }), true);
    assert.equal(canControl({ ownerId: OWNER }, { ...strangerA, role: "owner" }), true);
  });

  test("a session is only visible inside its own workspace", async () => {
    const session = await createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_A });
    assert.ok(await getSession(ORG_A, session.id));
    assert.equal(await getSession(ORG_B, session.id), null, "another workspace sees nothing");
    assert.equal((await listSessions(ORG_B)).length, 0);
  });

  test("another workspace cannot drive a session, and cannot tell it exists", async () => {
    const session = await createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_A });
    await assert.rejects(
      () => controlSession({ caller: ownerB, sessionId: session.id, action: "stop" }),
      (error: unknown) => error instanceof BrowserControlError && error.code === "session_not_found"
    );
  });

  test("a member who does not own the session is refused, with its own reason", async () => {
    const session = await createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_A });
    await assert.rejects(
      () => controlSession({ caller: strangerA, sessionId: session.id, action: "take_over" }),
      (error: unknown) => error instanceof BrowserControlError && error.code === "not_session_owner"
    );
  });

  test("control follows the stored state, not the request", async () => {
    const session = await createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_A });
    // Still 'created': pause is not a legal action yet, so the route cannot force it.
    await assert.rejects(
      () => controlSession({ caller: ownerA, sessionId: session.id, action: "pause" }),
      (error: unknown) => error instanceof BrowserControlError && error.code === "cannot_pause_from_created"
    );
    const started = await controlSession({ caller: ownerA, sessionId: session.id, action: "start" });
    assert.equal(started.session.status, "ready");
    const paused = await controlSession({ caller: ownerA, sessionId: session.id, action: "pause" });
    assert.equal(paused.session.status, "paused");
    const taken = await controlSession({ caller: ownerA, sessionId: session.id, action: "take_over" });
    assert.equal(taken.session.status, "taken_over");
    assert.equal(taken.session.controlHolder, "human");
    const returned = await controlSession({ caller: ownerA, sessionId: session.id, action: "return_control" });
    assert.equal(returned.session.controlHolder, "agent");
    const stopped = await controlSession({ caller: ownerA, sessionId: session.id, action: "stop" });
    assert.equal(stopped.session.status, "stopped");
    await assert.rejects(
      () => controlSession({ caller: ownerA, sessionId: session.id, action: "resume" }),
      (error: unknown) => error instanceof BrowserControlError && error.code === "session_ended"
    );
  });

  test("an expired session cannot be driven and is swept to expired", async () => {
    const session = await createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_A });
    await pg.query(`update "BrowserSession" set "expiresAt" = now() - interval '1 minute' where id = $1`, [session.id]);
    await assert.rejects(
      () => controlSession({ caller: ownerA, sessionId: session.id, action: "start" }),
      (error: unknown) => error instanceof BrowserControlError && error.code === "session_expired"
    );
    // Trying to drive it already expired it, which is the stronger guarantee: the refusal does not
    // leave an expired session looking alive.
    const after = await getSession(ORG_A, session.id);
    assert.equal(after?.status, "expired");

    // The sweep is what catches a session nobody tried to touch.
    const idle = await createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_A });
    await pg.query(`update "BrowserSession" set "expiresAt" = now() - interval '5 minutes' where id = $1`, [idle.id]);
    const swept = await expireDueSessions(ORG_A);
    assert.equal(swept, 1);
    assert.equal((await getSession(ORG_A, idle.id))?.status, "expired");
  });

  test("the database refuses a project from another workspace", async () => {
    await assert.rejects(() =>
      createSession({ organizationId: ORG_A, ownerId: OWNER, projectId: PROJECT_B })
    );
  });
});
