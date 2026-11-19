import "server-only";

/**
 * Server-side client for a Base44 Superagent.
 *
 * The API key never leaves the server: routes call this module, the browser
 * only ever sees the reply and the metering numbers. Keeping the key in an
 * environment variable (never in source) is what stops a leaked repository
 * from draining the agent's credits.
 */

const DEFAULT_API_BASE = "https://app.base44.com";

export type Base44Usage = {
  promptTokens: number;
  completionTokens: number;
  creditsCharged: number;
};

export type Base44Reply = {
  messageId: string;
  content: string;
  usage: Base44Usage;
};

export class Base44AgentError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "Base44AgentError";
    this.status = status;
  }
}

function readConfig() {
  const apiKey = process.env.BASE44_AGENT_API_KEY;
  const appId = process.env.BASE44_AGENT_APP_ID;
  const apiBase = process.env.BASE44_API_BASE ?? DEFAULT_API_BASE;

  if (!(apiKey && appId)) {
    throw new Base44AgentError(
      "Base44 agent is not configured: set BASE44_AGENT_API_KEY and BASE44_AGENT_APP_ID.",
      503
    );
  }

  return { apiKey, appId, apiBase };
}

export function isBase44AgentConfigured(): boolean {
  return Boolean(process.env.BASE44_AGENT_API_KEY && process.env.BASE44_AGENT_APP_ID);
}

async function callBase44<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey, appId, apiBase } = readConfig();
  const response = await fetch(`${apiBase}/api/agents/${appId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Base44AgentError(
      `Base44 ${path} failed (${response.status}): ${body.slice(0, 200)}`,
      response.status
    );
  }

  return (await response.json()) as T;
}

/** Creates a fresh conversation owned by the platform account. */
export async function createBase44Conversation(title?: string): Promise<string> {
  const conversation = await callBase44<{ id: string }>("/conversations", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });

  if (!conversation?.id) {
    throw new Base44AgentError("Base44 did not return a conversation id", 502);
  }

  return conversation.id;
}

/** Sends one user turn and waits for the agent's answer. */
export async function sendBase44Message({
  conversationId,
  content,
}: {
  conversationId: string;
  content: string;
}): Promise<Base44Reply> {
  const answer = await callBase44<{
    id: string;
    content: string | null;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      credits_charged?: number;
    } | null;
  }>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

  return {
    messageId: answer.id,
    content: answer.content ?? "",
    usage: {
      promptTokens: answer.usage?.prompt_tokens ?? 0,
      completionTokens: answer.usage?.completion_tokens ?? 0,
      creditsCharged: answer.usage?.credits_charged ?? 0,
    },
  };
}
