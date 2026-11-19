/**
 * Address reservation.
 *
 * The rule the product promises is "the name you reserve is yours". The only way
 * to keep that promise under concurrency is to let the database arbitrate: the
 * insert uses ON CONFLICT DO NOTHING and reports whether a row came back. A
 * read-then-write check would pass two simultaneous requests and hand the same
 * address to both.
 *
 * So this module does the cheap checks first (shape, reserved names, quota) to
 * avoid pointless writes, and then treats the insert's return value as the
 * final answer.
 */

import { checkLocalPart, type AddressProblem } from "./address";
import type { MailAddressRecord, MailProviderId, MailRepository } from "./types";

/** Small enough that a single workspace cannot claim the namespace. */
export const MAX_ADDRESSES_PER_ORGANIZATION = 5;
export const MAX_ADDRESSES_PER_USER = 3;

export type ReserveOutcome =
  | { ok: true; record: MailAddressRecord }
  | { ok: false; reason: "invalid" | "reserved" | "taken" | "quota"; detail?: AddressProblem | string };

export async function reserveMailAddress(input: {
  repo: MailRepository;
  organizationId: string;
  userId: string;
  localPart: string;
  provider?: MailProviderId;
}): Promise<ReserveOutcome> {
  const check = checkLocalPart(input.localPart);
  if (!check.ok) {
    // "reserved" is reported as its own reason so the UI can explain it without
    // revealing whether any particular reserved name is in use.
    if (check.reason === "reserved") return { ok: false, reason: "reserved" };
    return { ok: false, reason: "invalid", detail: check.reason };
  }

  const organizationCount = await input.repo.countAddresses(input.organizationId);
  if (organizationCount >= MAX_ADDRESSES_PER_ORGANIZATION) {
    return { ok: false, reason: "quota", detail: "organization" };
  }
  const userCount = await input.repo.countAddresses(input.organizationId, input.userId);
  if (userCount >= MAX_ADDRESSES_PER_USER) {
    return { ok: false, reason: "quota", detail: "user" };
  }

  const record = await input.repo.insertAddress({
    organizationId: input.organizationId,
    userId: input.userId,
    localPart: check.localPart,
    address: check.address,
    provider: input.provider ?? "hosted",
  });

  if (!record) return { ok: false, reason: "taken" };
  return { ok: true, record };
}
