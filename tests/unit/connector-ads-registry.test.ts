import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AD_CONNECTOR_SPECS } from "@/lib/integrations/connectors/ads-registry";
import {
  CONNECTOR_SPECS,
  connectorProviderIds,
  getConnectorSpec,
} from "@/lib/integrations/connectors/registry";
import { buildHeaders } from "@/lib/integrations/connectors/auth";

/**
 * The advertising and CRM set is data, so these tests check the data itself:
 * every URL is https, every provider is reachable by id, nothing is a write, and
 * a credential that does not carry the fields its URLs need is refused instead of
 * producing a request to a half-built address.
 */

const ADS = [
  "meta_ads",
  "tiktok_ads",
  "snapchat_ads",
  "linkedin_ads",
  "pinterest_ads",
  "reddit_ads",
  "amazon_ads",
  "x_ads",
  "hubspot",
  "airtable",
];

test("every advertising connector is registered exactly once", () => {
  const ids = connectorProviderIds();
  assert.equal(new Set(ids).size, ids.length, "a providerId is duplicated");
  for (const id of ADS) {
    assert.ok(getConnectorSpec(id), `${id} is not registered`);
  }
  assert.equal(CONNECTOR_SPECS.length, ids.length);
});

test("the new connectors add to the core set instead of replacing it", () => {
  for (const core of ["slack", "twilio", "shopify", "namecheap"]) {
    assert.ok(getConnectorSpec(core), `${core} disappeared from the registry`);
  }
  assert.equal(AD_CONNECTOR_SPECS.length, ADS.length);
});

test("every connector is https-only, documented, and read-only", () => {
  for (const spec of CONNECTOR_SPECS) {
    assert.ok(spec.docsUrl.startsWith("https://"), `${spec.providerId} docsUrl`);
    assert.ok(spec.labelAr.length > 1, `${spec.providerId} has no Arabic label`);
    assert.ok(
      spec.writeStatus.length > 20,
      `${spec.providerId} must explain why writes are absent`
    );
    for (const operation of spec.operations) {
      assert.equal(operation.kind, "read", `${spec.providerId}.${operation.id} is a write`);
      assert.ok(
        operation.docsUrl?.startsWith("https://"),
        `${spec.providerId}.${operation.id} has no docs link`
      );
    }
  }
});

test("verify URLs resolve to the provider's own host", () => {
  const hosts: Record<string, string> = {
    meta_ads: "graph.facebook.com",
    tiktok_ads: "business-api.tiktok.com",
    snapchat_ads: "adsapi.snapchat.com",
    linkedin_ads: "api.linkedin.com",
    pinterest_ads: "api.pinterest.com",
    reddit_ads: "ads-api.reddit.com",
    amazon_ads: "advertising-api.amazon.com",
    x_ads: "ads-api.x.com",
    hubspot: "api.hubapi.com",
    airtable: "api.airtable.com",
  };
  for (const [providerId, host] of Object.entries(hosts)) {
    const spec = getConnectorSpec(providerId)!;
    const fields =
      providerId === "amazon_ads"
        ? spec.parse("tok|client|profile")
        : providerId === "airtable"
          ? spec.parse("tok|appBase|tblTable")
          : providerId === "hubspot"
            ? spec.parse("tok")
            : spec.parse("tok|1234567890");
    const url = new URL(spec.verify.url(fields));
    assert.equal(url.protocol, "https:", `${providerId} verify is not https`);
    assert.equal(url.hostname, host, `${providerId} verify host`);
  }
});

test("a credential missing its account id is refused before any request", () => {
  for (const id of ["meta_ads", "tiktok_ads", "snapchat_ads", "linkedin_ads", "pinterest_ads", "reddit_ads", "x_ads"]) {
    const spec = getConnectorSpec(id)!;
    assert.throws(() => spec.parse("only-a-token"), /missing credential fields/, `${id}`);
  }
  assert.throws(() => getConnectorSpec("amazon_ads")!.parse("tok|client"), /missing credential fields/);
  assert.throws(() => getConnectorSpec("airtable")!.parse("tok|appBase"), /missing credential fields/);
  assert.throws(() => getConnectorSpec("hubspot")!.parse("   "), /missing credential fields/);
});

test("headers carry the tenant token and nothing else", () => {
  const linkedin = getConnectorSpec("linkedin_ads")!;
  const linkedinHeaders = buildHeaders(linkedin, linkedin.parse("secret-token|123"));
  assert.equal(linkedinHeaders.Authorization, "Bearer secret-token");
  assert.equal(linkedinHeaders["LinkedIn-Version"], "202411");

  const tiktok = getConnectorSpec("tiktok_ads")!;
  const tiktokHeaders = buildHeaders(tiktok, tiktok.parse("secret-token|123"));
  assert.equal(tiktokHeaders["Access-Token"], "secret-token");
  assert.equal(tiktokHeaders.Authorization, undefined);

  const amazon = getConnectorSpec("amazon_ads")!;
  const amazonHeaders = buildHeaders(amazon, amazon.parse("tok|client|profile"));
  assert.equal(amazonHeaders.Authorization, "Bearer tok");
  assert.equal(amazonHeaders["Amazon-Advertising-API-ClientId"], "client");
  assert.equal(amazonHeaders["Amazon-Advertising-API-Scope"], "profile");
});

test("the agent sees a compact collection path for every list operation", () => {
  // Amazon answers a bare JSON array for profiles, so it carries no path on
  // purpose: declaring one would make the executor read a field that is not there.
  const bareArray = new Set(["amazon_ads"]);
  for (const id of ADS) {
    const spec = getConnectorSpec(id)!;
    const listOps = spec.operations.filter((operation) => operation.collectionPath);
    if (bareArray.has(id)) {
      assert.equal(listOps.length, 0, `${id} declares a path for an array response`);
    } else {
      assert.ok(listOps.length >= 1, `${id} exposes no listable collection`);
    }
  }
});
