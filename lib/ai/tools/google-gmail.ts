import { tool } from "ai";
import { z } from "zod";
import { getGoogleDriveAccessToken } from "@/lib/integrations/google-drive/server";

/**
 * Gmail read-only tools. They reuse the workspace Google connection, so an
 * existing Drive-only connection must be reconnected once to grant Gmail.
 */

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
  maxResults: z.number().int().min(1).max(10).optional(),
});

const readInputSchema = z.object({
  messageId: z.string().regex(/^[A-Za-z0-9_-]{6,256}$/),
});

const gmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  snippet: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  payload: z
    .object({
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .optional(),
      body: z.object({ data: z.string().optional() }).optional(),
      parts: z
        .array(
          z.object({
            mimeType: z.string().optional(),
            body: z.object({ data: z.string().optional() }).optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

const gmailListSchema = z.object({
  messages: z
    .array(z.object({ id: z.string(), threadId: z.string().optional() }))
    .optional(),
  resultSizeEstimate: z.number().optional(),
});

function header(message: z.infer<typeof gmailMessageSchema>, name: string) {
  return (
    message.payload?.headers?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    .toString("utf8")
    .slice(0, 6000);
}

function bodyText(message: z.infer<typeof gmailMessageSchema>) {
  const direct = message.payload?.body?.data;
  if (direct) {
    return decodeBase64Url(direct);
  }
  const part = message.payload?.parts?.find(
    (item) => item.mimeType === "text/plain" && item.body?.data
  );
  return part?.body?.data ? decodeBase64Url(part.body.data) : "";
}

const RECONNECT_MESSAGE =
  "Gmail access is not granted for this workspace. Reconnect Google from Settings → Integrations to grant read-only Gmail access.";

async function gmailFetch(
  organizationId: string,
  path: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const accessToken = await getGoogleDriveAccessToken(organizationId);
  if (!accessToken) {
    return { ok: false, error: RECONNECT_MESSAGE };
  }
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: RECONNECT_MESSAGE };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `Gmail request failed with status ${response.status}.`,
    };
  }
  return { ok: true, data: await response.json() };
}

export function createGmailTools(organizationId: string) {
  return {
    searchGmail: tool({
      description:
        "Search the connected Gmail mailbox with a Gmail query (for example 'from:billing newer_than:30d') and return matching message headers.",
      inputSchema: searchInputSchema,
      execute: async ({ query, maxResults }) => {
        const limit = maxResults ?? 5;
        const list = await gmailFetch(
          organizationId,
          `/users/me/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`
        );
        if (!list.ok) {
          return { error: list.error };
        }
        const parsed = gmailListSchema.safeParse(list.data);
        if (!parsed.success || !parsed.data.messages?.length) {
          return { messages: [], note: "No messages matched that query." };
        }
        const messages = [];
        for (const item of parsed.data.messages.slice(0, limit)) {
          const detail = await gmailFetch(
            organizationId,
            `/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
          );
          if (!detail.ok) {
            continue;
          }
          const message = gmailMessageSchema.safeParse(detail.data);
          if (!message.success) {
            continue;
          }
          messages.push({
            id: message.data.id,
            from: header(message.data, "From"),
            date: header(message.data, "Date"),
            subject: header(message.data, "Subject"),
            snippet: message.data.snippet ?? "",
          });
        }
        return { messages };
      },
    }),
    readGmailMessage: tool({
      description:
        "Read one Gmail message (headers and plain-text body) by its id. Read-only; the Agent cannot send, delete or label mail.",
      inputSchema: readInputSchema,
      execute: async ({ messageId }) => {
        const detail = await gmailFetch(
          organizationId,
          `/users/me/messages/${messageId}?format=full`
        );
        if (!detail.ok) {
          return { error: detail.error };
        }
        const message = gmailMessageSchema.safeParse(detail.data);
        if (!message.success) {
          return { error: "Gmail returned an unexpected message shape." };
        }
        return {
          id: message.data.id,
          from: header(message.data, "From"),
          to: header(message.data, "To"),
          date: header(message.data, "Date"),
          subject: header(message.data, "Subject"),
          body: bodyText(message.data),
        };
      },
    }),
  };
}
