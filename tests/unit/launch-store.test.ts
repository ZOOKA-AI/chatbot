import assert from "node:assert/strict";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";

// The store reaches the database through the shared handle, whose import chain pulls
// NextAuth's next/server. Injecting a real client here keeps the test on PostgreSQL while
// keeping the request-side modules out of it.
const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

/**
 * Launch plans against real PostgreSQL.
 *
 * The assertions that matter are about what a plan refuses to say: nothing is completed on
 * creation, a step cannot be completed ahead of its dependencies, and another workspace
 * cannot read the plan at all.
 */

const ADMIN_URL = process.env.ZOOKA_TEST_PG_ADMIN;
const ORG_A = "aaaaaaaa-3333-4333-8333-333333333333";
const ORG_B = "bbbbbbbb-4444-4444-8444-444444444444";

let sql: ReturnType<typeof postgres> | null = null;
let store: typeof import("@/lib/agents/launch-store") | null = null;

const brief = {
  businessName: "Desert Rose Interiors",
  industry: "interior design",
  city: "Dubai",
  country: "AE",
  languages: ["en"] as Array<"ar" | "en">,
  services: ["villa styling"],
};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  process.env.DATABASE_URL = ADMIN_URL;
  // The shared handle is what these functions use when tenant RLS is off; the isolation
  // claim here is about the organizationId predicates, and the RLS path has its own tests.
  process.env.TENANT_RLS_ENABLED = "off";
  sql = postgres(ADMIN_URL, { max: 2, onnotice: () => {} });
  holder.db = drizzle(sql);
  store = await import("@/lib/agents/launch-store");
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

const suite = ADMIN_URL ? describe : describe.skip;

suite("a launch plan", () => {
  beforeEach(async () => {
    await sql!`delete from "AgentLaunchPlan" where "organizationId" in (${ORG_A}, ${ORG_B})`;
  });

  test("is never born completed", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    assert.ok(plan.steps.length >= 10, "the plan should cover the whole launch");
    assert.equal(
      plan.steps.filter((step) => step.state === "COMPLETED").length,
      0,
      "a freshly created plan claimed completed work"
    );
    assert.notEqual(plan.status, "completed");
  });

  test("separates what the agent can start from what needs the customer", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });

    const purchase = plan.steps.find((step) => step.id === "domain-purchase")!;
    assert.equal(purchase.state, "AWAITING_APPROVAL");

    const email = plan.steps.find((step) => step.id === "email")!;
    assert.equal(email.state, "BLOCKED");
    assert.ok(email.gate, "a blocked step must say why");

    const brand = plan.steps.find((step) => step.id === "brand")!;
    assert.equal(brand.state, "READY", "work the agent can start now should be ready");
  });

  test("reports awaiting approval while a purchase is undecided", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    assert.equal(plan.status, "awaiting_approval");
  });

  test("survives a round trip with its states intact", async () => {
    const created = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    const reloaded = await store!.getStoredPlan({ organizationId: ORG_A, planId: created.id });
    assert.ok(reloaded);
    assert.equal(reloaded!.steps.length, created.steps.length);
    assert.deepEqual(
      reloaded!.steps.map((step) => step.state),
      created.steps.map((step) => step.state)
    );
  });

  test("refuses to complete a step before its dependencies", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    const result = await store!.setStepState({
      organizationId: ORG_A,
      planId: plan.id,
      stepId: "domain-purchase",
      state: "COMPLETED",
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /dependency_not_complete/);
  });

  test("moves a step forward and re-derives the plan status", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    const done = await store!.setStepState({
      organizationId: ORG_A,
      planId: plan.id,
      stepId: "brand",
      state: "COMPLETED",
    });
    assert.equal(done.ok, true);
    assert.equal(done.plan!.steps.find((step) => step.id === "brand")!.state, "COMPLETED");

    // Everything is not complete, so the plan is not complete.
    assert.notEqual(done.plan!.status, "completed");
  });

  test("only becomes completed when every step is", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    for (const step of plan.steps) {
      await store!.setStepState({ organizationId: ORG_A, planId: plan.id, stepId: step.id, state: "COMPLETED" });
    }
    const reloaded = await store!.getStoredPlan({ organizationId: ORG_A, planId: plan.id });
    assert.equal(reloaded!.status, "completed");
  });

  test("is invisible to another workspace", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    assert.equal(await store!.getStoredPlan({ organizationId: ORG_B, planId: plan.id }), null);
    assert.equal((await store!.listStoredPlans({ organizationId: ORG_B })).length, 0);
    assert.equal((await store!.listStoredPlans({ organizationId: ORG_A })).length, 1);
  });

  test("cannot be advanced by another workspace either", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    const attempt = await store!.setStepState({
      organizationId: ORG_B,
      planId: plan.id,
      stepId: "brand",
      state: "COMPLETED",
    });
    assert.equal(attempt.ok, false);
    const reloaded = await store!.getStoredPlan({ organizationId: ORG_A, planId: plan.id });
    assert.equal(reloaded!.steps.find((step) => step.id === "brand")!.state, "READY");
  });

  test("names the next step the agent can actually start", async () => {
    const plan = await store!.createStoredPlan({ organizationId: ORG_A, brief });
    const next = store!.nextStep(plan);
    assert.ok(next);
    assert.equal(next!.state, "READY");
    assert.equal(next!.owner, "agent");
  });
});
