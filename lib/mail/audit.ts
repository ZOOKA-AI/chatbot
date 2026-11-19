/**
 * Audit trail and abuse evidence for mail.
 *
 * The rule is "who did what, when", and the constraint is that an audit row must
 * never become a second copy of the mailbox: no bodies, no subjects, no full
 * addresses. Metadata is filtered by allowlist rather than by redaction, so a
 * new field added elsewhere cannot leak into the log by default.
 */

import { maskAddress } from "./address";
import type { MailAuditRecord, MailRepository } from "./types";

export const MAIL_AUDIT_ACTIONS = [
  "mailbox.reserved",
  "mailbox.reserve_failed",
  "mailbox.listed",
  "message.read",
  "message.archived",
  "message.summarized",
  "draft.created",
  "draft.updated",
  "draft.send_blocked",
  "availability.checked",
  "rate_limited",
] as const;

export type MailAuditAction = (typeof MAIL_AUDIT_ACTIONS)[number];

/** Only these keys may appear in an audit row. Anything else is dropped. */
const SAFE_METADATA_KEYS: ReadonlySet<string> = new Set([
  "reason",
  "detail",
  "provider",
  "folder",
  "count",
  "messageCount",
  "aiGenerated",
  "actor",
  "senderDomain",
  "recipientDomain",
  "localPart",
]);

/**
 * An address is reduced to "h***@zooka-ai.com" before it can be stored. The
 * local part is kept only when the caller explicitly asks for it as
 * `localPart`, which is what the reservation row needs to stay useful.
 */
function safeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const text = value.slice(0, 120);
    if (key.endsWith("Domain")) return text;
    // Mask every address-shaped token inside the value, so a sentence that
    // quotes a sender cannot smuggle the full address into the log.
    return text.replace(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/gi, (found) => maskAddress(found));
  }
  return null;
}

export function buildMailAudit(input: {
  organizationId: string;
  userId: string | null;
  action: MailAuditAction;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): MailAuditRecord {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    const safe = safeValue(key, value);
    if (safe !== null) metadata[key] = safe;
  }
  return {
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    targetId: input.targetId ?? null,
    metadata,
  };
}

export async function recordMailAudit(input: {
  repo: MailRepository;
  organizationId: string;
  userId: string | null;
  action: MailAuditAction;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await input.repo.insertAudit(buildMailAudit(input));
  } catch (error) {
    // Auditing must never break the action it is recording; the failure is
    // reported to the server log and the caller continues.
    console.error("mail audit failed", (error as Error)?.message);
  }
}
