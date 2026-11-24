import type { ChannelCredentials, ChannelProvider } from "@/lib/agent/channels/providers";

export type SendResult = { ok: boolean; status: number; error?: string };

/**
 * One outbound message per provider. No retries here: the caller decides, so a
 * failing provider cannot loop inside a webhook request.
 */
export async function sendChannelMessage(args: {
  provider: ChannelProvider;
  credentials: ChannelCredentials;
  externalId: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<SendResult> {
  const doFetch = args.fetchImpl ?? fetch;
  const body = args.text.slice(0, 4000);

  try {
    if (args.provider === "telegram") {
      const response = await doFetch(`https://api.telegram.org/bot${args.credentials.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: args.externalId, text: body, disable_web_page_preview: true }),
      });
      return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, error: "telegram_rejected" };
    }

    if (args.provider === "whatsapp") {
      if (!args.credentials.phoneNumberId) {
        return { ok: false, status: 400, error: "missing_phone_number_id" };
      }
      const response = await doFetch(`https://graph.facebook.com/v21.0/${args.credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${args.credentials.token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: args.externalId,
          type: "text",
          text: { preview_url: false, body },
        }),
      });
      return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, error: "whatsapp_rejected" };
    }

    const response = await doFetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${args.credentials.token}` },
      body: JSON.stringify({ channel: args.externalId, text: body }),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: "slack_rejected" };
    }
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (payload && payload.ok === false) {
      return { ok: false, status: response.status, error: payload.error ?? "slack_error" };
    }
    return { ok: true, status: response.status };
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}
