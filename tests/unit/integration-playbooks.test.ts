import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPlaybook,
  INTEGRATION_PLAYBOOKS,
  playbookTokenProvider,
} from "@/lib/integrations/playbooks";
import { TOKEN_PROVIDERS } from "@/lib/integrations/token-providers";

test("every playbook is complete and bilingual", () => {
  assert.ok(INTEGRATION_PLAYBOOKS.length >= 20);
  const seen = new Set<string>();
  for (const playbook of INTEGRATION_PLAYBOOKS) {
    assert.ok(!seen.has(playbook.providerId), `duplicate ${playbook.providerId}`);
    seen.add(playbook.providerId);
    assert.ok(playbook.credentialEn.length > 3);
    assert.ok(playbook.credentialAr.length > 3);
    assert.ok(playbook.steps.length >= 1, `${playbook.providerId} has no steps`);
    for (const step of playbook.steps) {
      assert.ok(step.en.trim().length > 10, `${playbook.providerId} step en`);
      assert.ok(step.ar.trim().length > 10, `${playbook.providerId} step ar`);
    }
    assert.ok(playbook.verifyEn.trim().length > 5);
    assert.ok(playbook.verifyAr.trim().length > 5);
    for (const item of playbook.prerequisites) {
      assert.ok(item.en.trim().length > 3);
      assert.ok(item.ar.trim().length > 3);
    }
  }
});

test("self-serve playbooks point at a real token provider", () => {
  for (const playbook of INTEGRATION_PLAYBOOKS) {
    if (!playbook.tokenProviderId) {
      continue;
    }
    assert.ok(
      TOKEN_PROVIDERS[playbook.tokenProviderId],
      `${playbook.providerId} points at missing provider ${playbook.tokenProviderId}`
    );
  }
  assert.equal(playbookTokenProvider("google_ads"), "ryze");
  assert.equal(playbookTokenProvider("instagram"), "instagram");
  assert.equal(playbookTokenProvider("not-a-provider"), null);
});

test("blocked playbooks never claim self-serve", () => {
  for (const playbook of INTEGRATION_PLAYBOOKS) {
    if (playbook.connection === "blocked") {
      assert.equal(playbook.selfServe, false, playbook.providerId);
      assert.ok(playbook.limitsEn, `${playbook.providerId} must state its limit`);
    }
  }
  assert.equal(getPlaybook("tiktok")?.connection, "blocked");
  assert.equal(getPlaybook("nope"), null);
});
