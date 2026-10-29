import { expect, test } from "@playwright/test";
import { chatModels, modelSupportsTools } from "@/lib/ai/models";
import { getQuotaStatus } from "@/lib/saas/quota-utils";

test("quota limits stop usage at the plan boundary", () => {
  const freeAgent = getQuotaStatus("free", "agent_run", 0);
  expect(freeAgent).toMatchObject({
    allowed: false,
    limit: 0,
    remaining: 0,
  });

  const proSearch = getQuotaStatus("pro", "web_search", 999);
  expect(proSearch).toMatchObject({
    allowed: true,
    limit: 1000,
    remaining: 1,
  });
  expect(getQuotaStatus("pro", "web_search", 1000).allowed).toBe(false);
  expect(getQuotaStatus("pro", "agent_run", 499)).toMatchObject({
    allowed: true,
    limit: 500,
    remaining: 1,
  });

  const businessAgent = getQuotaStatus("business", "agent_run", 5000);
  expect(businessAgent).toMatchObject({
    allowed: false,
    limit: 5000,
    remaining: 0,
  });
});

test("Agent mode only uses models that support tools", () => {
  for (const model of chatModels) {
    expect(modelSupportsTools(model.id)).toBe(!model.id.endsWith("-thinking"));
  }
});
