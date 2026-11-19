import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  Base44AgentError,
  isBase44AgentConfigured,
  sendBase44Message,
} from "@/lib/base44/agent";
import {
  ensureBase44Session,
  getBase44UsageThisMonth,
  recordBase44Turn,
} from "@/lib/base44/store";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Safety gate: the platform key behind this route carries the agent's full
 * authority. Until a dedicated, tool-limited agent key exists, only workspace
 * owners and admins may reach it; set BASE44_AGENT_ALLOW_ALL=true to open it
 * to every member of the workspace.
 */
function isAgentAccessAllowed(role: string) {
  if (process.env.BASE44_AGENT_ALLOW_ALL === "true") {
    return true;
  }
  return role === "owner" || role === "admin";
}


export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [entitlements, billing, metering] = await Promise.all([
    getWorkspaceEntitlements(context.organizationId),
    getWorkspaceBilling(context.organizationId),
    getBase44UsageThisMonth(context.user.id),
  ]);

  return NextResponse.json({
    configured: isBase44AgentConfigured(),
    plan: entitlements.plan,
    canUseAgent: entitlements.canUseAgentMode,
    usage: {
      turns: metering.turns,
      credits: metering.credits,
      messagesUsed: billing.usage.messages,
      messagesLimit: entitlements.messagesLimit,
      agentRunsRemaining: entitlements.agentRunsRemaining,
    },
  });
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let message = "";
  try {
    const body = (await request.json()) as { message?: unknown };
    message = typeof body.message === "string" ? body.message.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }

  if (!isAgentAccessAllowed(context.role)) {
    return NextResponse.json({ error: "role_required" }, { status: 403 });
  }

  const [entitlements, billing] = await Promise.all([
    getWorkspaceEntitlements(context.organizationId),
    getWorkspaceBilling(context.organizationId),
  ]);

  // The Base44 agent is an agent run, so it follows the same plan gate as
  // Agent mode everywhere else in the product.
  if (!entitlements.canUseAgentMode) {
    return NextResponse.json(
      {
        error: "plan_required",
        plan: entitlements.plan,
        agentRunsRemaining: entitlements.agentRunsRemaining,
      },
      { status: 402 }
    );
  }

  if (billing.usage.messages >= entitlements.messagesLimit) {
    return NextResponse.json(
      {
        error: "quota_exhausted",
        used: billing.usage.messages,
        limit: entitlements.messagesLimit,
      },
      { status: 402 }
    );
  }

  try {
    // One conversation per member keeps each user's context and consumption
    // separate: nobody can reach another member's thread.
    const session = await ensureBase44Session({
      userId: context.user.id,
      organizationId: context.organizationId,
    });

    const reply = await sendBase44Message({
      conversationId: session.conversationId,
      content: message,
    });

    await recordBase44Turn({
      userId: context.user.id,
      organizationId: context.organizationId,
      creditsCharged: reply.usage.creditsCharged,
    });

    const metering = await getBase44UsageThisMonth(context.user.id);

    return NextResponse.json({
      reply: reply.content,
      usage: reply.usage,
      metering: { turns: metering.turns, credits: metering.credits },
      quota: {
        messagesUsed: billing.usage.messages + 1,
        messagesLimit: entitlements.messagesLimit,
      },
    });
  } catch (error) {
    if (error instanceof Base44AgentError) {
      return NextResponse.json(
        { error: "base44_error", message: error.message },
        { status: error.status === 401 ? 502 : error.status }
      );
    }
    console.error("base44 agent call failed", error);
    return NextResponse.json({ error: "base44_error" }, { status: 502 });
  }
}
