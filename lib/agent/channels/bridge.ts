import "server-only";

/**
 * The workspace agent runs as a private n8n webhook (the "brain"). Channels
 * reuse that same webhook instead of inventing a second brain, so an answer in
 * Telegram is the same answer the chat UI gives, and the same key stays server
 * side. Fails closed: with no key configured, nothing is sent anywhere.
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

export function channelBridgeConfigured(): boolean {
  return WEBHOOK_KEY.length > 0;
}

export type ChannelAgentReply = { ok: true; reply: string } | { ok: false; error: "not_configured" | "unreachable" | "agent_error" | "empty" };

export async function askAgentForChannel(args: {
  userId: string;
  provider: string;
  senderId: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<ChannelAgentReply> {
  if (!WEBHOOK_KEY) {
    return { ok: false, error: "not_configured" };
  }
  const doFetch = args.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await doFetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-solas-key": WEBHOOK_KEY },
      body: JSON.stringify({
        userId: args.userId,
        message: args.text.slice(0, 2000),
        history: [],
        channel: { provider: args.provider, senderId: args.senderId },
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "unreachable" };
  }
  if (!upstream.ok) {
    return { ok: false, error: "agent_error" };
  }
  const payload = (await upstream.json().catch(() => null)) as { reply?: unknown } | null;
  const reply = typeof payload?.reply === "string" ? payload.reply.trim() : "";
  if (!reply) {
    return { ok: false, error: "empty" };
  }
  return { ok: true, reply };
}
