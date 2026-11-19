/**
 * Tenant boundary for mail.
 *
 * The workspace is never taken from the request. The caller resolves it from the
 * session and passes it in, and every function here re-checks the record's own
 * organizationId before returning it. That second check is not redundant with
 * the query: it is what turns "the query happened to be scoped" into "the
 * response cannot be scoped otherwise", and it is the assertion a test can hold
 * us to when the query is rewritten later.
 */

import type {
  MailAddressRecord,
  MailFolder,
  MailMessageRecord,
  MailRepository,
} from "./types";

export type TenantResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" };

export async function loadMailbox(input: {
  repo: MailRepository;
  organizationId: string;
  mailAddressId: string;
}): Promise<TenantResult<MailAddressRecord>> {
  const record = await input.repo.getAddress(input.organizationId, input.mailAddressId);
  if (!record || record.organizationId !== input.organizationId) {
    // Same answer for "does not exist" and "belongs to someone else": a
    // different answer would confirm that an id is real.
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, value: record };
}

export async function listFolder(input: {
  repo: MailRepository;
  organizationId: string;
  mailAddressId: string;
  folder: MailFolder;
  limit?: number;
}): Promise<TenantResult<MailMessageRecord[]>> {
  const mailbox = await loadMailbox(input);
  if (!mailbox.ok) return mailbox;

  const messages = await input.repo.listMessages({
    organizationId: input.organizationId,
    mailAddressId: mailbox.value.id,
    folder: input.folder,
    limit: Math.min(Math.max(input.limit ?? 25, 1), 100),
  });

  // Defence in depth: a repository bug must not be able to widen the tenant.
  return {
    ok: true,
    value: messages.filter((message) => message.organizationId === input.organizationId),
  };
}
