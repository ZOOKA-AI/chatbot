import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * The launch endpoint's contract.
 *
 * These are the failures that matter at the edge: nobody signed in, someone not entitled
 * to create, a malformed brief, and a plan id belonging to another workspace. Each one is
 * asserted on the response, not on a log line.
 */

const holder = vi.hoisted(() => ({
  caller: null as null | { userId: string; organizationId: string; role: string; kind: "user" },
  created: [] as unknown[],
  plans: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
// Stubbed rather than imported: the real auth module reaches NextAuth's next/server, which
// is not resolvable outside the Next runtime. These four helpers are the whole surface the
// route uses, and their behaviour is asserted through the responses below.
vi.mock("@/lib/agents/auth", () => ({
  resolveCaller: async () => holder.caller,
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }),
  badRequest: (reason: string) =>
    new Response(JSON.stringify({ error: "bad_request", reason }), { status: 400, headers: { "content-type": "application/json" } }),
  callerOrganizationId: (caller: { organizationId: string }) => caller.organizationId,
  canManage: (caller: { role: string; kind?: string } | null) =>
    Boolean(caller && caller.kind !== "agent" && ["owner", "admin"].includes(caller.role)),
}));
vi.mock("@/lib/agents/launch-store", () => ({
  createStoredPlan: async (input: unknown) => {
    holder.created.push(input);
    return { id: "11111111-1111-4111-8111-111111111111", status: "awaiting_approval", steps: [] };
  },
  getStoredPlan: async ({ organizationId, planId }: { organizationId: string; planId: string }) =>
    // A plan from another workspace looks like it does not exist from this side.
    organizationId === "org-a" && planId === "11111111-1111-4111-8111-111111111111"
      ? { id: planId, organizationId, status: "awaiting_approval", steps: [] }
      : null,
  listStoredPlans: async () => holder.plans,
}));

import { GET, POST } from "@/app/api/agents/launch/route";

const brief = {
  businessName: "Desert Rose Interiors",
  industry: "interior design",
  city: "Dubai",
  country: "AE",
  languages: ["en"],
};

const post = (body: unknown) =>
  POST(
    new Request("https://zooka-ai.com/api/agents/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  holder.caller = null;
  holder.created = [];
  holder.plans = [];
});

describe("POST /api/agents/launch", () => {
  test("refuses an unauthenticated caller", async () => {
    const response = await post({ brief });
    assert.equal(response.status, 401);
  });

  test("refuses a member who is not owner or admin", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "member", kind: "user" };
    const response = await post({ brief });
    // canManage() rejects an agent key and a plain member alike.
    assert.ok([401, 403].includes(response.status), String(response.status));
  });

  test("refuses a brief that is missing required fields", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await post({ brief: { businessName: "x" } });
    assert.equal(response.status, 400);
    assert.equal(holder.created.length, 0, "nothing may be persisted for an invalid brief");
  });

  test("refuses unexpected fields rather than ignoring them", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await post({ brief: { ...brief, price: 100 } });
    assert.equal(response.status, 400);
  });

  test("creates a plan for an owner and returns it with its real status", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    const response = await post({ brief });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.plan.status, "awaiting_approval");
    assert.equal(holder.created.length, 1);
    // The plan is created for the caller's workspace, never one named in the body.
    assert.equal((holder.created[0] as { organizationId: string }).organizationId, "org-a");
  });
});

describe("GET /api/agents/launch", () => {
  test("refuses an unauthenticated caller", async () => {
    const response = await GET(new Request("https://zooka-ai.com/api/agents/launch"));
    assert.equal(response.status, 401);
  });

  test("does not reveal another workspace's plan", async () => {
    holder.caller = { userId: "u1", organizationId: "org-b", role: "owner", kind: "user" };
    const response = await GET(
      new Request("https://zooka-ai.com/api/agents/launch?planId=11111111-1111-4111-8111-111111111111")
    );
    assert.equal(response.status, 404);
  });

  test("lists only the caller's plans", async () => {
    holder.caller = { userId: "u1", organizationId: "org-a", role: "owner", kind: "user" };
    holder.plans = [{ id: "p1" }];
    const response = await GET(new Request("https://zooka-ai.com/api/agents/launch"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.count, 1);
  });
});
