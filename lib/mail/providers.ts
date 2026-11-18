/**
 * Mail provider adapters.
 *
 * The product needs one interface and three realities:
 *   - hosted: mailboxes on zooka-ai.com itself. Needs IMAP/SMTP provisioning and
 *     a store for credentials, neither of which exists yet, so it is declared
 *     and NOT ACTIVATED.
 *   - gmail: the workspace's own Gmail connection already exists and can be read
 *     through it. Sending through Gmail stays blocked, because the connector
 *     layer refuses writes on purpose (write_blocked) and because the product
 *     rule is that no message leaves without an explicit, audited action.
 *   - outlook: no connection exists in this codebase, so the contract is here and
 *     nothing is claimed about it.
 *
 * A caller that reaches an inactive adapter gets a typed error, never a silent
 * success. That is the difference between "we support this" and "we built the
 * seam".
 */

import { guardedFetch } from "@/lib/studio/outbound-guard";
import { getIntegrationTokens } from "@/lib/integrations/catalog";

import { htmlToText, sanitizeHtml } from "./sanitize";
import type { MailFolder, MailProviderId } from "./types";

export class MailProviderNotActivated extends Error {
  readonly providerId: MailProviderId;
  constructor(providerId: MailProviderId, message: string) {
    super(message);
    this.name = "MailProviderNotActivated";
    this.providerId = providerId;
  }
}

export type ProviderMessage = {
  providerMessageId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  bodyHtml: string;
  bodyText: string;
  receivedAt: Date;
};

export type MailboxProvider = {
  id: MailProviderId;
  label: string;
  labelAr: string;
  status: "available" | "not_activated";
  read: boolean;
  send: boolean;
  /** What would have to exist for this adapter to become real. */
  requirement: string;
};

export const MAIL_PROVIDERS: MailboxProvider[] = [
  {
    id: "hosted",
    label: "ZOOKA hosted mailbox",
    labelAr: "صندوق ZOOKA المستضاف",
    status: "not_activated",
    read: false,
    send: false,
    requirement:
      "Provision IMAP/SMTP for zooka-ai.com and a credential store for per-mailbox passwords.",
  },
  {
    id: "gmail",
    label: "Gmail (read only)",
    labelAr: "جيميل (قراءة فقط)",
    status: "available",
    read: true,
    send: false,
    requirement:
      "Sending needs an approved write path; the connector layer blocks writes today.",
  },
  {
    id: "outlook",
    label: "Outlook",
    labelAr: "أوتلوك",
    status: "not_activated",
    read: false,
    send: false,
    requirement: "Register an Outlook OAuth app and add it to the connector registry.",
  },
];

export function getMailProvider(id: string): MailboxProvider | null {
  return MAIL_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name?: string; value?: string };

function header(headers: GmailHeader[] | undefined, name: string): string {
  const found = headers?.find((entry) => (entry.name ?? "").toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

function decodeBase64Url(value: string): string {
  try {
    const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalised, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** Walks the MIME tree for the first text/html part, falling back to text/plain. */
function extractBody(payload: any): { html: string; text: string } {
  let html = "";
  let text = "";

  const visit = (part: any) => {
    if (!part || typeof part !== "object") return;
    const mime = String(part.mimeType ?? "");
    const data = part.body?.data;
    if (mime === "text/html" && typeof data === "string" && !html) {
      html = decodeBase64Url(data);
    }
    if (mime === "text/plain" && typeof data === "string" && !text) {
      text = decodeBase64Url(data);
    }
    for (const child of part.parts ?? []) visit(child);
  };

  visit(payload);
  return { html, text };
}

export type GmailReadResult =
  | { ok: true; messages: ProviderMessage[] }
  | { ok: false; reason: "not_connected" | "provider_error" | "blocked"; detail?: string };

/**
 * Reads the newest messages of the connected Gmail account.
 *
 * Read only, by construction: there is no code path here that posts a message.
 * Every request goes through the shared outbound guard, so a compromised or
 * rewritten endpoint cannot turn this into an arbitrary fetch.
 */
export async function readGmailMessages(input: {
  workspaceId: string;
  folder?: MailFolder;
  limit?: number;
}): Promise<GmailReadResult> {
  const tokens = await getIntegrationTokens(input.workspaceId, "gmail").catch(() => null);
  const token = typeof tokens?.accessToken === "string" ? tokens.accessToken : "";
  if (!token) return { ok: false, reason: "not_connected" };

  // Only the inbox maps onto Gmail's own labels; the other folders are ours.
  if (input.folder && input.folder !== "inbox") return { ok: true, messages: [] };
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);

  try {
    const listResponse = await guardedFetch(
      `${GMAIL_API}/messages?maxResults=${limit}&labelIds=INBOX`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!listResponse.ok) {
      return { ok: false, reason: "provider_error", detail: String(listResponse.status) };
    }
    const list = (await listResponse.json()) as { messages?: Array<{ id?: string }> };
    const ids = (list.messages ?? []).map((entry) => entry.id).filter(Boolean) as string[];

    const messages: ProviderMessage[] = [];
    for (const id of ids) {
      const detailResponse = await guardedFetch(
        `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!detailResponse.ok) continue;
      const detail = (await detailResponse.json()) as any;
      const payload = detail.payload ?? {};
      const body = extractBody(payload);
      messages.push({
        providerMessageId: id,
        fromAddress: header(payload.headers, "from").replace(/.*<([^>]+)>.*/, "$1").trim(),
        fromName: header(payload.headers, "from").replace(/<[^>]*>/, "").replace(/"/g, "").trim() || null,
        subject: header(payload.headers, "subject") || "(no subject)",
        snippet: String(detail.snippet ?? "").slice(0, 200),
        // Sanitised before it is ever stored or rendered.
        bodyHtml: sanitizeHtml(body.html || body.text),
        bodyText: body.text || htmlToText(body.html),
        receivedAt: new Date(Number(detail.internalDate ?? Date.now())),
      });
    }

    return { ok: true, messages };
  } catch (error) {
    const blocked = (error as Error)?.name === "OutboundBlocked";
    return {
      ok: false,
      reason: blocked ? "blocked" : "provider_error",
      detail: String((error as Error)?.message ?? "").slice(0, 120),
    };
  }
}

/**
 * Sending is deliberately absent from every adapter in this build. The function
 * exists so callers get one explicit refusal instead of a missing method.
 */
export async function sendMessage(): Promise<never> {
  throw new MailProviderNotActivated(
    "hosted",
    "Sending is not activated: no provider write path is approved in this build."
  );
}
