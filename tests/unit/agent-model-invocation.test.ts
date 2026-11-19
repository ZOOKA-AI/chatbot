import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * The worker's model path, tested for the two properties that make it a real path and not a claim:
 * it refuses before the network when it should, and it only reports success when a provider answered.
 *
 * Every transport here is a stub. That is stated rather than implied: these are mocked provider tests.
 * A real provider call is a separate, explicitly authorised step and is not asserted anywhere in this file.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  invokeAgentModel,
  modelProviders,
  recordModelUsage,
  resolveAgentModel,
} from "@/lib/agents/model-invocation";

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  /*
   * The smallest schema this path actually reads. It is written here rather than pulled from 0038 because
   * 0038 alters AgentIdentity; the table itself arrives in 0027, and a unit test that depends on the whole
   * migration history is measuring the migrations, not this module.
   */
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS "AgentIdentity" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" varchar(64) NOT NULL UNIQUE,
      "displayName" varchar(120) NOT NULL,
      "role" varchar(64) NOT NULL,
      "keyHash" varchar(64) NOT NULL,
      "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed',
      "scopes" json NOT NULL DEFAULT '[]',
      "environment" varchar(24) NOT NULL DEFAULT 'production',
      "status" varchar(24) NOT NULL DEFAULT 'active',
      "modelProvider" varchar(32),
      "modelId" varchar(80),
      "allowedTools" json,
      "instructions" text,
      "projectId" uuid,
      "lastSeenAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );
  `);
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS "UsageEvent" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "organizationId" uuid NOT NULL,
      "userId" uuid NOT NULL,
      "event" varchar(64) NOT NULL,
      "quantity" integer NOT NULL DEFAULT 1,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );
  `);
  holder.db = drizzle(pg, { schema }) as unknown as ReturnType<typeof drizzle>;
});

async function makeAgent(overrides: Record<string, unknown> = {}) {
  const values = {
    slug: `agent-${Math.random().toString(36).slice(2, 8)}`,
    displayName: "Writer",
    role: "writer",
    keyHash: "hash",
    organizationId: ORG_A,
    modelProvider: "groq",
    modelId: "openai/gpt-4.1-mini",
    ...overrides,
  };
  const columns = Object.keys(values).join('","');
  const placeholders = Object.keys(values).map((_, i) => `$${i + 1}`).join(",");
  const [row] = (
    await pg.query<{ id: string }>(
      `INSERT INTO "AgentIdentity" ("${columns}") VALUES (${placeholders}) RETURNING "id"`,
      Object.values(values)
    )
  ).rows;
  return row.id as string;
}

function okResponse(text: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

const env = { GROQ_API_KEY: "test-key-not-real" };

describe("provider configuration", () => {
  test("a provider without a server credential is simply absent", () => {
    assert.deepEqual(Object.keys(modelProviders({})), []);
    assert.deepEqual(Object.keys(modelProviders(env)), ["groq"]);
  });

  test("the credential never appears outside the header", () => {
    const config = modelProviders(env).groq;
    assert.equal(config.apiKey, "test-key-not-real");
    // A base URL is configuration an operator can see; a key is not part of it.
    assert.ok(!config.baseUrl.includes("test-key-not-real"));
  });
});

describe("resolving the model", () => {
  test("an unconfigured model is refused, not defaulted", () => {
    assert.deepEqual(resolveAgentModel({ modelProvider: null, modelId: null }), { error: "model_not_configured" });
  });

  test("a model outside the registry is refused by name", () => {
    const verdict = resolveAgentModel({ modelProvider: "groq", modelId: "someone/unknown-model" });
    assert.ok("error" in verdict && verdict.error.startsWith("model_not_allowed:"));
  });

  test("a provider-catalogue model resolves without touching the shared registry", () => {
    assert.deepEqual(resolveAgentModel({ modelProvider: "groq", modelId: "openai/gpt-oss-120b" }), {
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
  });

  test("a registry model resolves to its provider and id", () => {
    assert.deepEqual(resolveAgentModel({ modelProvider: "groq", modelId: "openai/gpt-4.1-mini" }), {
      provider: "groq",
      model: "openai/gpt-4.1-mini",
    });
  });
});

describe("invoking", () => {
  test("an agent from another workspace is not found", async () => {
    const id = await makeAgent();
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return okResponse("should not happen");
    }) as unknown as typeof fetch;

    const result = await invokeAgentModel(
      { organizationId: ORG_B, agentId: id, prompt: "hello" },
      { env, fetchImpl }
    );
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "agent_not_found");
    assert.equal(called, false, "a cross-tenant call must not reach the provider");
  });

  test("a disabled agent is refused by its own state", async () => {
    const id = await makeAgent({ status: "disabled" });
    const result = await invokeAgentModel({ organizationId: ORG_A, agentId: id, prompt: "hi" }, { env });
    assert.equal(!result.ok && result.code, "agent_disabled");
  });

  test("no credential means no call and an honest reason", async () => {
    const id = await makeAgent();
    let called = false;
    const result = await invokeAgentModel(
      { organizationId: ORG_A, agentId: id, prompt: "hi" },
      { env: {}, fetchImpl: (async () => { called = true; return okResponse("x"); }) as unknown as typeof fetch }
    );
    assert.equal(!result.ok && result.code, "credential_missing");
    assert.equal(called, false);
  });

  test("a successful call reports the provider's own text and usage", async () => {
    const id = await makeAgent();
    const seen: Array<{ url: string; body: unknown; auth: string | null }> = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers as HeadersInit);
      seen.push({ url, body: JSON.parse(String(init.body)), auth: headers.get("authorization") });
      return okResponse("مرحباً، هذه إجابة حقيقية من المزوّد.");
    }) as unknown as typeof fetch;

    const result = await invokeAgentModel(
      { organizationId: ORG_A, agentId: id, prompt: "اكتب سطراً" },
      { env, fetchImpl }
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.text, "مرحباً، هذه إجابة حقيقية من المزوّد.");
    assert.equal(seen.length, 1);
    assert.ok(seen[0].url.endsWith("/chat/completions"));
    assert.equal(seen[0].auth, "Bearer test-key-not-real");
    const body = seen[0].body as { model: string; messages: Array<{ role: string; content: string }> };
    assert.equal(body.model, "openai/gpt-4.1-mini");
    assert.equal(body.messages.at(-1)?.content, "اكتب سطراً");
    assert.equal(result.ok && result.usage?.totalTokens, 17);
  });

  test("a provider error is a failure that says a call happened", async () => {
    const id = await makeAgent();
    const fetchImpl = (async () => new Response("upstream boom", { status: 500 })) as unknown as typeof fetch;
    const result = await invokeAgentModel({ organizationId: ORG_A, agentId: id, prompt: "hi" }, { env, fetchImpl });
    assert.equal(!result.ok && result.code, "provider_http_500");
    assert.equal(!result.ok && result.invoked, true, "a 500 means the provider was reached");
  });

  test("an empty completion is not passed off as an answer", async () => {
    const id = await makeAgent();
    const fetchImpl = (async () => okResponse("   ")) as unknown as typeof fetch;
    const result = await invokeAgentModel({ organizationId: ORG_A, agentId: id, prompt: "hi" }, { env, fetchImpl });
    assert.equal(!result.ok && result.code, "empty_completion");
  });

  test("a timeout is reported as a timeout", async () => {
    const id = await makeAgent();
    const fetchImpl = (async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;
    const result = await invokeAgentModel({ organizationId: ORG_A, agentId: id, prompt: "hi" }, { env, fetchImpl });
    assert.equal(!result.ok && result.code, "model_timeout");
  });

  test("a transport failure is distinguished from a refusal", async () => {
    const id = await makeAgent();
    const fetchImpl = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const result = await invokeAgentModel({ organizationId: ORG_A, agentId: id, prompt: "hi" }, { env, fetchImpl });
    assert.equal(!result.ok && result.code, "model_transport_failed");
  });

  test("an empty prompt never reaches the provider", async () => {
    const id = await makeAgent();
    let called = false;
    const result = await invokeAgentModel(
      { organizationId: ORG_A, agentId: id, prompt: "  " },
      { env, fetchImpl: (async () => { called = true; return okResponse("x"); }) as unknown as typeof fetch }
    );
    assert.equal(!result.ok && result.code, "empty_prompt");
    assert.equal(called, false);
  });
});

describe("recording usage", () => {
  test("a call is counted once in the existing usage stream", async () => {
    await recordModelUsage({
      organizationId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      model: "openai/gpt-4.1-mini",
      usage: { promptTokens: 12, completionTokens: 5, totalTokens: 17 },
      latencyMs: 40,
    });
    const { rows } = await pg.query<{ event: string; quantity: number }>(
      `SELECT "event", "quantity" FROM "UsageEvent"`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event, "agent_model_call");
    assert.equal(rows[0].quantity, 1);
  });
});
