import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
} from "@/lib/integrations/catalog";

const BASE = "https://api.telegram.org";

export const TELEGRAM_BOT_NOT_CONNECTED =
  "The Telegram bot is not connected for this workspace. Connect it from Settings → Integrations with the BotFather token.";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function botToken(workspaceId: string) {
  const tokens = await getIntegrationTokens(workspaceId, "telegram_bot");
  const token =
    tokens && typeof tokens.accessToken === "string" ? tokens.accessToken : "";
  return token || null;
}

async function call<T>(
  workspaceId: string,
  method: string,
  params: Record<string, string> = {},
  body?: Record<string, unknown>
): Promise<Result<T>> {
  const token = await botToken(workspaceId);
  if (!token) {
    return { ok: false, error: TELEGRAM_BOT_NOT_CONNECTED };
  }
  try {
    const url = new URL(`${BASE}/bot${token}/${method}`);
    if (!body) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
    };
    if (!response.ok || payload.ok === false) {
      const message = payload.description ?? `Telegram returned ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        await markConnectionError(workspaceId, "telegram_bot", message);
      }
      return { ok: false, error: message };
    }
    return { ok: true, data: payload.result as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Telegram request failed",
    };
  }
}

export async function getTelegramBot(workspaceId: string) {
  const bot = await call<Record<string, unknown>>(workspaceId, "getMe");
  if (!bot.ok) {
    return bot;
  }
  const webhook = await call<Record<string, unknown>>(
    workspaceId,
    "getWebhookInfo"
  );
  return {
    ok: true as const,
    data: {
      id: bot.data.id ?? null,
      username: bot.data.username ?? null,
      name: bot.data.first_name ?? null,
      canJoinGroups: bot.data.can_join_groups ?? null,
      webhookUrl:
        webhook.ok && typeof webhook.data.url === "string" && webhook.data.url
          ? webhook.data.url
          : null,
      pendingUpdates:
        webhook.ok && typeof webhook.data.pending_update_count === "number"
          ? webhook.data.pending_update_count
          : null,
    },
  };
}

export async function getTelegramChat(workspaceId: string, chatId: string) {
  const chat = await call<Record<string, unknown>>(workspaceId, "getChat", {
    chat_id: chatId,
  });
  if (!chat.ok) {
    return chat;
  }
  return {
    ok: true as const,
    data: {
      id: chat.data.id ?? null,
      type: chat.data.type ?? null,
      title: chat.data.title ?? chat.data.first_name ?? null,
      username: chat.data.username ?? null,
    },
  };
}

export async function sendTelegramMessage(
  workspaceId: string,
  chatId: string,
  text: string
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false as const, error: "The message text is empty." };
  }
  const sent = await call<Record<string, unknown>>(
    workspaceId,
    "sendMessage",
    {},
    { chat_id: chatId, text: trimmed, disable_web_page_preview: true }
  );
  if (!sent.ok) {
    return sent;
  }
  return {
    ok: true as const,
    data: {
      messageId: sent.data.message_id ?? null,
      chatId,
      delivered: true as const,
    },
  };
}
