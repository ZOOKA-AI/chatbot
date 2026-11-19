import { tool } from "ai";
import { z } from "zod";
import { getGoogleDriveAccessToken } from "@/lib/integrations/google-drive/server";

/**
 * Gmail tools: search, read and send. They reuse the workspace Google
 * connection, so an existing connection created before gmail.send was added
 * must be reconnected once to grant the send scope.
 */

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
  maxResults: z.number().int().min(1).max(10).optional(),
});

const readInputSchema = z.object({
  messageId: z.string().regex(/^[A-Za-z0-9_-]{6,256}$/),
});

const sendInputSchema = z.object({
  to: z
    .string()
    .trim()
    .min(5)
    .max(320)
    .describe("Recipient email address. Comma-separate up to 5 recipients."),
  subject: z.string().trim().min(1).max(200),
  body: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .describe("Plain-text message body. Line breaks are preserved."),
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
  "Gmail access is not granted for this workspace. Reconnect Google from Settings → Integrations to grant Gmail access.";

const SEND_SCOPE_MESSAGE =
  "Gmail send permission is not granted for this workspace yet. Reconnect Google from Settings → Integrations and keep the «إرسال بريد إلكتروني نيابة عنك» permission checked.";

async function gmailFetch(
  organizationId: string,
  path: string,
  init?: { method: string; body: unknown }
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const accessToken = await getGoogleDriveAccessToken(organizationId);
  if (!accessToken) {
    return { ok: false, error: RECONNECT_MESSAGE };
  }
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: init ? SEND_SCOPE_MESSAGE : RECONNECT_MESSAGE };
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
    sendGmailMessage: tool({
      description:
        "Send a plain-text email from the connected Gmail mailbox. The message is delivered immediately, so only call this when the user clearly asked to send mail, and confirm the recipient, subject and body in your reply.",
      inputSchema: sendInputSchema,
      execute: async ({ to, subject, body }) => {
        const recipients = to
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (recipients.length === 0 || recipients.length > 5) {
          return { error: "Provide between 1 and 5 recipient addresses." };
        }
        const invalid = recipients.find(
          (item) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(item)
        );
        if (invalid) {
          return { error: `"${invalid}" is not a valid email address.` };
        }
        const mime = [
          `To: ${recipients.join(", ")}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "Content-Transfer-Encoding: base64",
          "",
          Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8")
            .toString("base64")
            .replace(/(.{76})/g, "$1\r\n"),
        ].join("\r\n");
        const sent = await gmailFetch(organizationId, "/users/me/messages/send", {
          method: "POST",
          body: {
            raw: Buffer.from(mime, "utf8")
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, ""),
          },
        });
        if (!sent.ok) {
          return { error: sent.error };
        }
        const result = z
          .object({
            id: z.string(),
            threadId: z.string().optional(),
            labelIds: z.array(z.string()).optional(),
          })
          .safeParse(sent.data);
        if (!result.success) {
          return { error: "Gmail accepted the request but returned no message id." };
        }
        return {
          sent: true,
          id: result.data.id,
          threadId: result.data.threadId,
          to: recipients,
          subject,
        };
      },
    }),
  };
}
