import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Every place the server fetches an address it did not hard-code.
 *
 * Three surfaces take part: the studio gateway (covered by outbound-guard.test.ts), the browser's
 * embed check (the customer types the URL) and the n8n health probe (an admin stores the base URL).
 * The rule these tests hold is the same for all of them: assessing the URL that was typed is not
 * enough, because the response picks where the request lands. A public host answering 302 to
 * 169.254.169.254 or to loopback must be a refusal, not a request issued from inside the network.
 *
 * The fetch stub records every URL it is asked for, so "refused" is proven by the absence of a call
 * and not only by the shape of the returned verdict.
 */

const calls: string[] = [];

vi.mock("@/lib/auth/workspace", () => ({
  getWorkspaceContext: async () => ({
    organizationId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    role: "owner",
    user: { type: "regular" },
  }),
}));

const credentials: { baseUrl: string; apiKey: string } | null = {
  baseUrl: "https://n8n.example.com",
  apiKey: "test-key",
};

vi.mock("@/lib/integrations/n8n/store", () => ({
  getN8nCredentials: async () => credentials,
}));

import { GET as embedCheck } from "@/app/api/workspace/browser/embed-check/route";
import { buildN8nAdminOverview } from "@/lib/integrations/n8n/admin-overview";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function stubFetch(handler: (url: string) => Response): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return handler(url);
  });
}

function askEmbed(url: string) {
  return embedCheck(
    new Request(`https://zooka-ai.com/api/workspace/browser/embed-check?url=${encodeURIComponent(url)}`)
  );
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("embed check: the response decides the destination, not only the typed URL", () => {
  test("a private address is refused before any request is made", async () => {
    stubFetch(() => jsonResponse({}));
    const response = await askEmbed("http://127.0.0.1:5432/");
    const verdict = (await response.json()) as { embeddable: boolean; reason: string };
    expect(verdict.embeddable).toBe(false);
    expect(verdict.reason).toBe("unsafe_url");
    assert.deepEqual(calls, [], "no request may leave the process for a private address");
  });

  test("a public page that redirects to the metadata service is a refusal, not a request", async () => {
    stubFetch((url) =>
      url.startsWith("http://169.254.169.254")
        ? jsonResponse({ leaked: "credentials" })
        : redirectResponse("http://169.254.169.254/latest/meta-data/iam/")
    );

    const response = await askEmbed("https://example.com/panel");
    const verdict = (await response.json()) as { embeddable: boolean; reason: string; detail: string };

    expect(verdict.embeddable).toBe(false);
    expect(verdict.reason).toBe("unsafe_url");
    expect(verdict.detail).toBe("metadata_endpoint");
    expect(calls.filter((url) => url.startsWith("http://169.254.169.254"))).toEqual([]);
  });

  test("a public page that redirects to loopback is a refusal too", async () => {
    stubFetch((url) =>
      url.includes("127.0.0.1") ? jsonResponse({}) : redirectResponse("http://127.0.0.1:9000/admin")
    );

    const response = await askEmbed("https://example.com/panel");
    const verdict = (await response.json()) as { embeddable: boolean; reason: string };
    expect(verdict.reason).toBe("unsafe_url");
    expect(calls.some((url) => url.includes("127.0.0.1"))).toBe(false);
  });

  test("an ordinary page still gets a verdict, so the guard does not break the feature", async () => {
    stubFetch(
      () =>
        new Response("<html><body>ok</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
    );

    const response = await askEmbed("https://example.com/");
    const verdict = (await response.json()) as { embeddable: boolean; reason: string };
    expect(verdict.reason).toBe("allowed");
    expect(verdict.embeddable).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("n8n health probe: a stored base URL is still an outbound destination", () => {
  test("a base URL pointed at the metadata service never renders as connected", async () => {
    credentials.baseUrl = "http://169.254.169.254";
    stubFetch((url) => jsonResponse({ data: [], url }));
    const overview = await buildN8nAdminOverview("11111111-1111-4111-8111-111111111111");
    credentials.baseUrl = "https://n8n.example.com";

    expect(overview.stage).toBe("configured");
    expect(overview.probeError).toBe("blocked_destination");
    assert.deepEqual(calls, [], "the metadata address must not be requested");
  });

  test("a base URL redirected into loopback is refused on the hop, not followed", async () => {
    credentials.baseUrl = "https://example.com";
    stubFetch((url) =>
      url.includes("127.0.0.1") ? jsonResponse({ data: [] }) : redirectResponse("http://127.0.0.1:5678/api/v1/workflows")
    );
    const overview = await buildN8nAdminOverview("11111111-1111-4111-8111-111111111111");

    expect(overview.stage).toBe("configured");
    expect(overview.probeError).toBe("blocked_destination");
    expect(calls.some((url) => url.includes("127.0.0.1"))).toBe(false);
    credentials.baseUrl = "https://n8n.example.com";
  });

  test("a healthy instance is still measured as reachable", async () => {
    // A resolvable public name: the guard resolves DNS on purpose, so this case exercises the
    // measurement path rather than the policy path.
    credentials.baseUrl = "https://example.com";
    stubFetch((url) =>
      jsonResponse({
        data: url.includes("workflows")
          ? [{ id: "wf-1", name: "Daily", active: true, updatedAt: "2026-11-18T06:00:00Z" }]
          : [
              {
                id: 1,
                workflowId: "wf-1",
                status: "success",
                startedAt: "2026-11-18T06:00:00Z",
                stoppedAt: "2026-11-18T06:00:05Z",
              },
            ],
      })
    );
    const overview = await buildN8nAdminOverview("11111111-1111-4111-8111-111111111111");

    expect(overview.probeError).toBeNull();
    expect(["connected", "operational", "agent_ready"]).toContain(overview.stage);
    expect(overview.workflowCount).toBe(1);
    credentials.baseUrl = "https://n8n.example.com";
  });
});
