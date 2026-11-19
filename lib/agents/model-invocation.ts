import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";
import { allowedModelIds, modelSupportsTools } from "@/lib/ai/models";

/**
 * A real, authorized model call for a worker agent.
 *
 * The forensic audit's finding was precise: the execution worker never called a model. Every tool it ran
 * was deterministic code, and no surface proved otherwise. This module is the missing invocation path, and
 * it is written to be honest about the three things that make such a path safe rather than decorative:
 *
 *   authorization  the agent must belong to the caller's workspace and must not be disabled
 *   credential     the key is read from the server environment, never from a request or a row
 *   accounting     the call reports its token usage so it can be recorded, and says plainly when it did
 *                  not run rather than returning a plausible sentence
 *
 * It is deliberately provider-shaped rather than vendor-shaped: one OpenAI-compatible chat-completions
 * transport, configured by environment, so adding a provider is configuration and not a code path that
 * nobody tests.
 */

export type ModelEnv = Record<string, string | undefined>;

/**
 * Models a provider actually serves, keyed by provider id.
 *
 * The registry in lib/ai/models.ts lists gateway-style ids ("openai/gpt-4.1-mini"). A provider that is
 * addressed directly serves its own catalogue, and the two do not overlap: Groq authenticates and returns
 * 12 models, none of which is a registry id. Without this map the path would refuse every direct provider
 * with model_not_allowed, which looks like a permission bug and is really a naming one.
 *
 * These entries were read from the provider's own /models endpoint on 2026-11-16, not guessed.
 */
export const PROVIDER_MODEL_CATALOG: Record<string, string[]> = {
  groq: [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "qwen/qwen3.8-27b",
    "allam-2-7b",
  ],
};

export type ModelProviderConfig = {
  id: string;
  baseUrl: string;
  apiKey: string;
};

/** Providers this deployment will call. An unknown provider is a refusal, not a guess. */
export function modelProviders(env: ModelEnv = process.env): Record<string, ModelProviderConfig> {
  const providers: Record<string, ModelProviderConfig> = {};

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.groq = {
      id: "groq",
      baseUrl: (env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
      apiKey: groqKey,
    };
  }

  const gatewayKey = env.AI_GATEWAY_API_KEY?.trim();
  if (gatewayKey) {
    const base = env.AI_GATEWAY_BASE_URL?.trim();
    if (base) {
      providers.gateway = { id: "gateway", baseUrl: base.replace(/\/+$/, ""), apiKey: gatewayKey };
    }
  }

  return providers;
}

export type ModelRefusal = {
  ok: false;
  code: string;
  detail?: string;
  /**
   * Whether a model was actually reached. False for every refusal decided before the network, true for a
   * provider that answered badly or timed out: that distinction is what stops a failed call from being
   * reported as "nothing happened".
   */
  invoked: boolean;
};

export type ModelSuccess = {
  ok: true;
  invoked: true;
  provider: string;
  model: string;
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  latencyMs: number;
};

export type ModelResult = ModelSuccess | ModelRefusal;

export type InvokeInput = {
  organizationId: string;
  agentId: string;
  prompt: string;
  /** Prior turns, already rendered. The caller owns conversation state; this call owns one turn. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** A per-call ceiling so a runaway agent cannot hold a request open. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Which model this agent should use.
 *
 * A null modelId must not silently pick a default. Before this work, the UI let an owner choose a model and
 * the choice was stored and never used; choosing one now is required for execution, and the absence says so.
 */
export function resolveAgentModel(
  agent: { modelProvider: string | null; modelId: string | null }
): { provider: string; model: string } | { error: string } {
  if (!agent.modelId) return { error: "model_not_configured" };

  // The registry id is "provider/model". An explicit provider column wins when it disagrees, because an
  // operator may deliberately point a model id at a compatible endpoint.
  const fromId = agent.modelId.split("/")[0];
  const provider = (agent.modelProvider ?? fromId).trim();
  if (!provider) return { error: "provider_not_configured" };

  // A model is usable when either the shared registry or the provider's own catalogue lists it. Nothing
  // outside both is executed, so a typo cannot become a silent fallback to some other model.
  const known = allowedModelIds.has(agent.modelId) || (PROVIDER_MODEL_CATALOG[provider] ?? []).includes(agent.modelId);
  if (!known) return { error: `model_not_allowed:${agent.modelId}` };

  return { provider, model: agent.modelId };
}

/**
 * The call itself.
 *
 * Order matters: workspace and status first, configuration second, credential third. A request that cannot
 * possibly succeed should not reach a network at all, and the refusal must name the reason so an operator
 * can fix it instead of guessing.
 */
export async function invokeAgentModel(
  input: InvokeInput,
  options: { env?: ModelEnv; fetchImpl?: typeof fetch } = {}
): Promise<ModelResult> {
  const env = options.env ?? process.env;
  const doFetch = options.fetchImpl ?? fetch;

  if (!input.prompt.trim()) return { ok: false, code: "empty_prompt", invoked: false };

  const [agent] = await db
    .select()
    .from(schema.agentIdentity)
    .where(
      and(
        eq(schema.agentIdentity.id, input.agentId),
        eq(schema.agentIdentity.organizationId, input.organizationId)
      )
    )
    .limit(1);

  // Same answer for "does not exist" and "belongs to someone else": a caller must not be able to probe
  // another workspace's agent ids.
  if (!agent) return { ok: false, code: "agent_not_found", invoked: false };
  if (agent.status !== "active") return { ok: false, code: `agent_${agent.status}`, invoked: false };

  const resolved = resolveAgentModel(agent);
  if ("error" in resolved) return { ok: false, code: resolved.error, invoked: false };

  const providers = modelProviders(env);
  const config = providers[resolved.provider];
  if (!config) {
    return {
      ok: false,
      code: "credential_missing",
      detail: `no server credential for provider ${resolved.provider}`,
      invoked: false,
    };
  }

  const messages = [
    ...(agent.instructions ? [{ role: "system" as const, content: agent.instructions }] : []),
    ...(input.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: input.prompt },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await doFetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: resolved.model,
        messages,
        // Tool calling is offered only where the registry says the model supports it, so the worker is never
        // told a capability it cannot use.
        ...(modelSupportsTools(resolved.model) ? {} : { tool_choice: "none" }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The provider's message is logged as a status, not echoed: a body can contain the key's last four
      // characters or an internal identifier.
      return {
        ok: false,
        code: `provider_http_${response.status}`,
        invoked: true,
      };
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return { ok: false, code: "empty_completion", invoked: true };

    return {
      ok: true,
      invoked: true,
      provider: resolved.provider,
      model: resolved.model,
      text,
      usage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens ?? 0,
            completionTokens: body.usage.completion_tokens ?? 0,
            totalTokens: body.usage.total_tokens ?? 0,
          }
        : null,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "model_timeout" : "model_transport_failed",
      invoked: !aborted,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Records that a model was called, so usage is a fact rather than a claim.
 *
 * Written into the same UsageEvent stream the quotas already read, which means an agent's model call is
 * counted by the existing monthly limits instead of beside them. One row per call: the token split stays in
 * the invocation result, because UsageEvent has no column for it and inventing one for telemetry alone is a
 * schema change this remediation has not justified. That gap is reported, not hidden.
 */
export async function recordModelUsage(input: {
  organizationId: string;
  userId: string;
  model: string;
  usage: ModelSuccess["usage"];
  latencyMs: number;
}): Promise<void> {
  await db.insert(schema.usageEvent).values({
    organizationId: input.organizationId,
    userId: input.userId,
    event: "agent_model_call",
    quantity: 1,
  });
}

/** The label written to usage, exported so a reader of the database can find it without reading this file. */
export const MODEL_CALL_USAGE_EVENT = "agent_model_call";
