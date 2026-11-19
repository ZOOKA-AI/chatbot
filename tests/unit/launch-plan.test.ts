import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildLaunchPlan,
  domainCandidates,
  startableOrder,
  stepNeedsOwner,
  type LaunchBrief,
} from "@/lib/agents/launch-plan";

/**
 * The launch plan is deterministic on purpose, so these tests can assert its shape. What
 * matters most is what it refuses to claim: a step that needs the customer stays a customer
 * step, and a purchase is never an agent step.
 */

const brief: LaunchBrief = {
  businessName: "Royal Cleaning UAE",
  industry: "cleaning services",
  city: "Dubai",
  country: "AE",
  languages: ["ar", "en"],
  services: ["deep cleaning", "villa cleaning"],
};

describe("domain candidates are usable", () => {
  test("business name becomes a slug, not a sentence", () => {
    const candidates = domainCandidates({ ...brief, businessName: "Royal  Cleaning & Co.!!" });
    assert.equal(candidates[0], "royal-cleaning-co.com");
  });

  test("a city variant is offered because the plain name is usually taken", () => {
    assert.ok(domainCandidates(brief).some((domain) => domain.includes("dubai")));
  });

  test("an unusable name yields no candidates instead of a broken domain", () => {
    assert.deepEqual(domainCandidates({ ...brief, businessName: "!!!" }), []);
  });

  test("no duplicate candidates", () => {
    const candidates = domainCandidates(brief);
    assert.equal(new Set(candidates).size, candidates.length);
  });
});

describe("the plan never promises what the platform cannot do", () => {
  test("a domain is an approval step, never an agent step", () => {
    const plan = buildLaunchPlan(brief);
    const purchase = plan.steps.find((step) => step.id === "domain-purchase");
    assert.ok(purchase);
    assert.equal(purchase!.owner, "approval");
    assert.ok(plan.blockedOnApproval.includes("domain-purchase"));
    assert.match(purchase!.gate ?? "", /total|approve/i);
  });

  test("publishing is gated separately from building", () => {
    const plan = buildLaunchPlan(brief);
    assert.equal(plan.steps.find((s) => s.id === "website")!.owner, "agent");
    assert.equal(plan.steps.find((s) => s.id === "publish")!.owner, "approval");
  });

  test("email is a customer step because the provider verifies identity", () => {
    const plan = buildLaunchPlan(brief);
    const email = plan.steps.find((step) => step.id === "email");
    assert.equal(email!.owner, "customer");
  });

  test("DNS is a customer step only when no registrar is connected", () => {
    const without = buildLaunchPlan(brief);
    assert.equal(without.steps.find((s) => s.id === "dns")!.owner, "customer");

    const withRegistrar = buildLaunchPlan(brief, { connectedProviders: ["namecheap"] });
    assert.equal(withRegistrar.steps.find((s) => s.id === "dns")!.owner, "agent");
  });

  test("existing accounts are connected, not created", () => {
    const plan = buildLaunchPlan({ ...brief, existingAccounts: ["instagram"] });
    assert.ok(plan.steps.some((s) => s.id === "social-connect"));
    assert.ok(!plan.steps.some((s) => s.id === "social-create"));
  });

  test("search setup does not promise a ranking", () => {
    const plan = buildLaunchPlan(brief);
    const seo = plan.steps.find((s) => s.id === "seo")!;
    assert.match(seo.detail, /no ranking is promised/i);
  });

  test("advertising requires a budget approval", () => {
    const plan = buildLaunchPlan(brief);
    assert.ok(plan.blockedOnApproval.includes("ads"));
  });
});

describe("ordering respects dependencies", () => {
  test("every step appears exactly once, after its dependencies", () => {
    const plan = buildLaunchPlan(brief);
    const order = startableOrder(plan);
    assert.equal(order.length, plan.steps.length);
    const position = new Map(order.map((id, index) => [id, index]));
    for (const step of plan.steps) {
      for (const dependency of step.dependsOn) {
        assert.ok(
          position.get(dependency)! < position.get(step.id)!,
          `${step.id} was placed before its dependency ${dependency}`
        );
      }
    }
  });

  test("the domain cannot be bought before it is searched", () => {
    const order = startableOrder(buildLaunchPlan(brief));
    assert.ok(order.indexOf("domain-search") < order.indexOf("domain-purchase"));
  });

  test("nothing is published before the site exists", () => {
    const order = startableOrder(buildLaunchPlan(brief));
    assert.ok(order.indexOf("website") < order.indexOf("publish"));
  });
});

test("only an agent step runs without asking", () => {
  const plan = buildLaunchPlan(brief);
  for (const step of plan.steps) {
    assert.equal(stepNeedsOwner(step), step.owner !== "agent", step.id);
  }
});
