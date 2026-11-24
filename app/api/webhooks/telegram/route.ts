import { NextResponse, after } from "next/server";
import { findAgentChannelBySender, recordAgentChannelMessage } from "@/lib/db/agent-channels";
import { getWorkspaceSecretValue } from "@/lib/db/workspace-secrets";
import { parseChannelCredentials } from "@/lib/agent/channels/providers";
import { verifyTelegramSecret } from "@/lib/agent/channels/verify";
import { askAgentForChannel } from "@/lib/agent/channels/bridge";
import { sendChannelMessage } from "@/lib/agent/channels/send";

export const maxDuration = 60;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { first_name?: string };
  };
};

/**
 * Inbound Telegram updates for a linked workspace channel.
 *
 * Fail closed: without TELEGRAM_WEBHOOK_SECRET the route refuses every update,
 * so an unconfigured deployment cannot be used as an open relay to the agent.
 */
export async function POST(request: Request) {
  const secret = verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  let update: TelegramUpdate;
  try {
    update = JSON.parse(rawBody) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (chatId === undefined || !text) {
    return NextResponse.json({ ok: true, ignored: "no_text" });
  }

  const channel = await findAgentChannelBySender("telegram", String(chatId));
  if (!channel) {
    return NextResponse.json({ ok: true, ignored: "unlinked" });
  }
  if (!channel.createdBy) {
    return NextResponse.json({ ok: true, ignored: "no_owner" });
  }

  const senderId = String(chatId);
  const ownerId = channel.createdBy;
  const organizationId = channel.organizationId;
  const secretName = channel.secretName;
  const channelId = channel.id;

  // Telegram expects a fast 200; the answer is produced afterwards.
  after(async () => {
    const raw = await getWorkspaceSecretValue(organizationId, secretName);
    const credentials = raw ? parseChannelCredentials("telegram", raw) : null;
    if (!credentials) {
      return;
    }
    const answer = await askAgentForChannel({ userId: ownerId, provider: "telegram", senderId, text });
    if (!answer.ok) {
      return;
    }
    const sent = await sendChannelMessage({ provider: "telegram", credentials, externalId: senderId, text: answer.reply });
    if (sent.ok) {
      await recordAgentChannelMessage(channelId);
    }
  });

  return NextResponse.json({ ok: true });
}
