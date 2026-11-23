import { describe, expect, test } from "vitest";

import {
  connectPathFor,
  connectorCatalog,
  connectorLink,
  connectorRead,
} from "@/lib/agents/worker-tools/connectors";
import { WORKER_TOOLS } from "@/lib/agents/worker";

const signal = new AbortController().signal;
const ctx = { organizationId: "org-1", agentId: "agent-1", payload: {}, signal, fetchImpl: fetch };

describe("connect paths", () => {
  test("generic OAuth providers use the shared connect route", () => {
    expect(connectPathFor("github")).toEqual({ path: "/api/integrations/github/connect", mode: "oauth" });
    expect(connectPathFor("vercel")).toEqual({ path: "/api/integrations/vercel/connect", mode: "oauth" });
    expect(connectPathFor("meta")).toEqual({ path: "/api/integrations/meta/connect", mode: "oauth" });
  });

  test("providers with their own route keep it", () => {
    expect(connectPathFor("tiktok")).toEqual({ path: "/api/integrations/tiktok/authorize", mode: "oauth" });
    expect(connectPathFor("google-drive")).toEqual({
      path: "/api/integrations/google-drive/connect",
      mode: "oauth",
    });
    expect(connectPathFor("x")).toEqual({ path: "/api/integrations/x/connect", mode: "oauth" });
  });

  test("pasted-token providers point at the settings page", () => {
    const link = connectPathFor("slack");
    expect(link).toEqual({ path: "/settings/integrations", mode: "token" });
  });

  test("an unknown provider has no route instead of a guess", () => {
    expect(connectPathFor("not-a-provider")).toBeNull();
    expect(connectPathFor("")).toBeNull();
  });
});

describe("connector tools are registered for the worker", () => {
  test("all four are in WORKER_TOOLS and read-only", () => {
    for (const name of ["connector_catalog", "connector_status", "connector_read", "connector_link"]) {
      expect(WORKER_TOOLS[name]).toBeDefined();
      expect(WORKER_TOOLS[name].readOnly).toBe(true);
    }
  });
});

describe("connector_catalog", () => {
  test("reports the registry it actually has", async () => {
    const result = await connectorCatalog.run(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const evidence = result.evidence as { totals: { total: number }; connectors: unknown[] };
    expect(evidence.totals.total).toBeGreaterThan(0);
    expect(evidence.connectors.length).toBe(evidence.totals.total);
  });
});

describe("connector_link", () => {
  test("returns a path and a hint, never a credential", async () => {
    const result = await connectorLink.run({ ...ctx, payload: { providerId: "slack" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const evidence = result.evidence as { mode: string; path: string; tokenHint: string | null };
    expect(evidence.mode).toBe("token");
    expect(evidence.path).toBe("/settings/integrations");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
    expect(serialized).not.toMatch(/xox[abps]-[0-9]{6,}/);
  });

  test("refuses a provider with no route", async () => {
    const result = await connectorLink.run({ ...ctx, payload: { providerId: "not-a-provider" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("no_connect_route");
  });

  test("requires a provider id", async () => {
    const result = await connectorLink.run({ ...ctx, payload: {} });
    expect(result.ok).toBe(false);
  });
});

describe("connector_read refuses before it calls anything", () => {
  test("missing payload", async () => {
    const result = await connectorRead.run({ ...ctx, payload: { providerId: "slack" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_payload");
  });

  test("unknown provider", async () => {
    const result = await connectorRead.run({
      ...ctx,
      payload: { providerId: "not-a-provider", operationId: "list" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unknown_provider");
  });

  test("unknown operation lists what exists", async () => {
    const result = await connectorRead.run({
      ...ctx,
      payload: { providerId: "slack", operationId: "definitely_not_an_operation" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unknown_operation");
    expect(result.summary).toMatch(/available:/);
  });
});
