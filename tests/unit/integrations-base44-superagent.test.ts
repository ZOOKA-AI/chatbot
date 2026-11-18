import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { buildIntegrationMatrix } from "@/lib/integrations/connectors/matrix";
import { INTEGRATION_PLAYBOOKS } from "@/lib/integrations/playbooks";
import { INTEGRATION_PROVIDERS, PROVIDER_CATEGORIES } from "@/lib/integrations/providers";

/**
 * The Base44 Superagent card exists to be honest, so these assertions are about what it may NOT claim.
 *
 * An external agent API is documented by the provider, but documenting an endpoint is not permission to
 * integrate and it is certainly not a verified connection. If someone later flips the status to
 * "available", adds a connector spec, or lets the matrix count it as implemented, the card starts
 * advertising a capability nobody proved. This test fails at that point instead of in front of a customer.
 */
const id = "base44_superagent";

describe("Base44 Superagent integration entry", () => {
  test("is catalogued under its own category as unavailable, not as coming soon", () => {
    const provider = INTEGRATION_PROVIDERS.find((row) => row.id === id);
    assert.ok(provider, "the provider is missing from the catalogue");
    assert.equal(provider!.status, "unavailable");
    assert.equal(provider!.category, "ai_agents");
    assert.equal(PROVIDER_CATEGORIES.ai_agents?.en, "AI Agents & Automation");
    assert.match(provider!.description, /API unverified/);
    assert.match(provider!.descriptionAr, /غير موثّقة/);
    assert.equal(provider!.managed, false);
  });

  test("has a blocked playbook so no credential form is offered", () => {
    const playbook = INTEGRATION_PLAYBOOKS.find((row) => row.providerId === id);
    assert.ok(playbook, "a catalogue entry without a playbook fails the matrix");
    assert.equal(playbook!.connection, "blocked");
    assert.equal(playbook!.selfServe, false);
    // No endpoint, path or key value may be asserted as known here; only the documented shape is named.
    assert.doesNotMatch(playbook!.credentialEn, /https?:\/\//);
  });

  test("the agent matrix does not report it as implemented, tooled or verified", () => {
    const row = buildIntegrationMatrix().find((entry) => entry.providerId === id);
    assert.ok(row, "the row is missing from the matrix");
    assert.equal(row!.providerImplemented, false);
    assert.equal(row!.agentToolsVerified, false);
    assert.equal(row!.authenticationVerified, false);
    assert.equal(row!.readOperationsVerified, false);
    assert.equal(row!.multiTenantIsolationVerified, false);
    assert.deepEqual(row!.readOperations, []);
    assert.deepEqual(row!.blockers, ["provider_api_unverified"]);
  });
});
