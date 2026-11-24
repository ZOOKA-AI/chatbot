import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  appendAgentMessage,
  getAgentHistory,
  getWorkspaceBilling,
  trackWorkspaceUsage,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import {
  groundedMessage,
  needsWebSearch,
  searchQueryFor,
  type WebSource,
} from "@/lib/agent/web-grounding";
import { searchTavily } from "@/lib/ai/tools/web-search";
import { awardFirstTask } from "@/lib/growth/referrals";
import { checkQuota, recordUsage } from "@/lib/saas/quota";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { workspacePlans } from "@/lib/saas/plans";

/**
 * Server-side bridge to the private n8n agent (the "brain").
 *
 * The shared secret never reaches the browser: only this route calls the
 * webhook, and it scopes every request to the signed-in user AND their
 * workspace, so two customers can never share agent memory.
 *
 * Requires AGENT_WEBHOOK_KEY (and optionally AGENT_WEBHOOK_URL) in the
 * server environment; Preview may override both with AGENT_WEBHOOK_*_PREVIEW.
 * server environment. The route fails closed with 503 when unset.
 */
export const maxDuration = 60;

/**
 * Preview acceptance must never reach the production agent webhook. The
 * *_PREVIEW variables exist only on the Preview scope, so a preview deployment
 * falls back to an isolated test webhook instead of the live agent, and the
 * production secret types are never widened by adding a Preview target.
 */
const WEBHOOK_URL =
  process.env.AGENT_WEBHOOK_URL_PREVIEW ??
  process.env.AGENT_WEBHOOK_URL ??
  "https://helmyharoon817979.n8n-wsk.com/webhook/zooka-agent";

const WEBHOOK_KEY =
  process.env.AGENT_WEBHOOK_KEY_PREVIEW ??
  process.env.AGENT_WEBHOOK_KEY ??
  process.env.SOLAS_AGENT_KEY ??
  "";

type AgentResponse = {
  ok?: boolean;
  reply?: string;
  steps?: number;
  error?: string;
};

async function POSTImpl(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  if (!WEBHOOK_KEY) {
    return Response.json(
      { error: "agent_not_configured" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  let payload: { message?: unknown };
  try {
    payload = (await request.json()) as { message?: unknown };
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message || message.length > 2000) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  // Same entitlement source as the usage and billing pages.
  const [{ usage }, entitlements] = await Promise.all([
    getWorkspaceBilling(context.organizationId),
    getWorkspaceEntitlements(context.organizationId),
  ]);
  const plan = entitlements.plan;
  const limit = (workspacePlans[plan] ?? workspacePlans.free).monthlyAgentRuns;

  if (usage.agentRuns >= limit) {
    return Response.json(
      {
        error: "plan_limit_reached",
        plan,
        limit,
        used: usage.agentRuns,
        upgrade: "/workspace/billing",
      },
      { status: 429, headers: { "cache-control": "no-store" } }
    );
  }

  // The n8n agent has no search tool, so fresh information is fetched here
  // and passed in as untrusted context. Search failures never block the task.
  let sources: WebSource[] = [];
  if (process.env.TAVILY_API_KEY && needsWebSearch(message)) {
    const quota = await checkQuota(
      context.user.id,
      "web_search",
      context.organizationId
    ).catch(() => ({ allowed: false }));
    if (quota.allowed) {
      try {
        sources = await searchTavily(searchQueryFor(message));
        await recordUsage(context.user.id, "web_search", context.organizationId);
      } catch {
        sources = [];
      }
    }
  }

  // One memory lane per member inside their own workspace.
  const agentUserId = `${context.organizationId}:${context.user.id}`;

  // Conversation memory lives in Postgres, so it survives n8n rebuilds.
  const history = await getAgentHistory(context.organizationId, agentUserId, 10).catch(
    () => []
  );

  let upstream: Response;
  try {
    upstream = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-solas-key": WEBHOOK_KEY,
      },
      body: JSON.stringify({
        userId: agentUserId,
        message: groundedMessage(message, sources),
        history,
      }),
      signal: AbortSignal.timeout(50_000),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: "agent_unreachable" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "agent_error", status: upstream.status },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  let data: AgentResponse;
  try {
    data = (await upstream.json()) as AgentResponse;
  } catch {
    return Response.json(
      { error: "agent_bad_response" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  const reply = (data.reply ?? "").trim();
  if (!reply) {
    return Response.json(
      { error: "agent_empty_reply" },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    await appendAgentMessage({
      organizationId: context.organizationId,
      userId: context.user.id,
      conversationKey: agentUserId,
      role: "user",
      content: message,
    });
    await appendAgentMessage({
      organizationId: context.organizationId,
      userId: context.user.id,
      conversationKey: agentUserId,
      role: "assistant",
      content: reply,
    });
  } catch {
    // Memory writes must never lose an answer that was already produced.
  }

  await awardFirstTask({
    userId: context.user.id,
    organizationId: context.organizationId,
  }).catch(() => undefined);

  try {
    await trackWorkspaceUsage({
      organizationId: context.organizationId,
      userId: context.user.id,
      event: "agent_run",
    });
  } catch {
    // Usage accounting must never break a delivered answer.
  }

  return Response.json(
    {
      reply,
      steps: data.steps ?? 1,
      sources: sources.map(({ title, url }) => ({ title, url })),
      plan,
      limit,
      used: usage.agentRuns + 1,
    },
    { headers: { "cache-control": "no-store" } }
  );
}

// Tenant-scoped wrappers: query work runs inside the caller's tenant transaction.
export const POST = withRequestTenantHandler(POSTImpl);
