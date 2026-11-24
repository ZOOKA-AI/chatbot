import { NextResponse, after } from "next/server";
import { findAgentChannelBySender, recordAgentChannelMessage } from "@/lib/db/agent-channels";
import { getWorkspaceSecretValue } from "@/lib/db/workspace-secrets";
import { parseChannelCredentials } from "@/lib/agent/channels/providers";
import { verifySlackSignature } from "@/lib/agent/channels/verify";
import { askAgentForChannel } from "@/lib/agent/channels/bridge";
import { sendChannelMessage } from "@/lib/agent/channels/send";

export const maxDuration = 60;

type SlackEvent = {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    channel?: string;
    text?: string;
    bot_id?: string;
    subtype?: string;
  };
};

/**
 * Inbound Slack events for a linked workspace channel.
 *
 * Every request is signature-verified against SLACK_SIGNING_SECRET with a
 * five-minute window, including the url_verification handshake.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });
  if (!verification.ok) {
    const status = verification.reason === "not_configured" ? 503 : 401;
    return NextResponse.json({ error: verification.reason }, { status });
  }

  let payload: SlackEvent;
  try {
    payload = JSON.parse(rawBody) as SlackEvent;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const event = payload.event;
  const channelId = event?.channel;
  const text = event?.text?.trim() ?? "";
  if (event?.type !== "message" || event.bot_id || event.subtype || !channelId || !text) {
    return NextResponse.json({ ok: true, ignored: "not_a_user_message" });
  }

  const channel = await findAgentChannelBySender("slack", channelId);
  if (!channel) {
    return NextResponse.json({ ok: true, ignored: "unlinked" });
  }
  if (!channel.createdBy) {
    return NextResponse.json({ ok: true, ignored: "no_owner" });
  }

  const ownerId = channel.createdBy;
  const organizationId = channel.organizationId;
  const secretName = channel.secretName;
  const rowId = channel.id;

  after(async () => {
    const raw = await getWorkspaceSecretValue(organizationId, secretName);
    const credentials = raw ? parseChannelCredentials("slack", raw) : null;
    if (!credentials) {
      return;
    }
    const answer = await askAgentForChannel({ userId: ownerId, provider: "slack", senderId: channelId, text });
    if (!answer.ok) {
      return;
    }
    const sent = await sendChannelMessage({ provider: "slack", credentials, externalId: channelId, text: answer.reply });
    if (sent.ok) {
      await recordAgentChannelMessage(rowId);
    }
  });

  return NextResponse.json({ ok: true });
}
