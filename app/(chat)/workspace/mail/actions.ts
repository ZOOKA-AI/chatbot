"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { checkAddress } from "@/lib/mail/address";
import { recordMailAudit } from "@/lib/mail/audit";
import { summarizeMessage, suggestDraft } from "@/lib/mail/ai";
import { listFolder, loadMailbox } from "@/lib/mail/isolation";
import { checkMailLimit } from "@/lib/mail/rate-limit";
import { createMailRepository } from "@/lib/mail/repository";
import { reserveMailAddress } from "@/lib/mail/reserve";
import { sanitizeHtml } from "@/lib/mail/sanitize";
import { isMailFolder } from "@/lib/mail/types";

/**
 * Server actions for ZOOKA Mail.
 *
 * Two rules are enforced here rather than in the UI, because the UI is not a
 * boundary: the workspace comes from the session, never from the form; and no
 * action sends mail. The one that could (sendDraft) refuses, records the attempt
 * and says why.
 */

export type MailActionResult =
  | { ok: true; message?: string; address?: string; available?: boolean; text?: string }
  | { ok: false; reason: string; message: string };

const AR = {
  noSession: "الجلسة منتهية. سجّل الدخول من جديد.",
  limited: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
  invalid: "الاسم غير صالح. استخدم حروفًا إنجليزية وأرقامًا ونقطة أو شرطة فقط، من 3 إلى 32 حرفًا.",
  reserved: "هذا الاسم محجوز للنظام.",
  taken: "هذا الاسم مأخوذ بالفعل.",
  quota: "وصلت الحد الأقصى لعدد العناوين.",
  saved: "تم حجز العنوان.",
  notFound: "الصندوق غير موجود.",
  summarized: "تم التلخيص.",
  draftSaved: "تم حفظ المسودة.",
  sendBlocked:
    "الإرسال غير مُفعّل في هذه النسخة. لا يوجد مسار إرسال معتمد، والمسودة محفوظة للمراجعة.",
  unavailable: "تعذّر تنفيذ الطلب.",
};

async function session() {
  const context = await getWorkspaceContext();
  if (!context?.user?.organizationId || !context.user.id) return null;
  return {
    organizationId: context.user.organizationId,
    userId: context.user.id,
  };
}

/** Reservation: shape, reserved list, quota, then the database decides the race. */
export async function reserveAddressAction(formData: FormData): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const limit = checkMailLimit("reserve", auth.userId);
  if (!limit.allowed) return { ok: false, reason: "throttled", message: AR.limited };

  const raw = String(formData.get("localPart") ?? "");
  const repo = createMailRepository();
  const outcome = await reserveMailAddress({
    repo,
    organizationId: auth.organizationId,
    userId: auth.userId,
    localPart: raw,
  });

  if (!outcome.ok) {
    await recordMailAudit({
      repo,
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "mailbox.reserve_failed",
      metadata: { reason: outcome.reason },
    });
    const message =
      outcome.reason === "reserved"
        ? AR.reserved
        : outcome.reason === "taken"
          ? AR.taken
          : outcome.reason === "quota"
            ? AR.quota
            : AR.invalid;
    return { ok: false, reason: outcome.reason, message };
  }

  await recordMailAudit({
    repo,
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: "mailbox.reserved",
    targetId: outcome.record.id,
    metadata: { localPart: outcome.record.localPart, provider: outcome.record.provider },
  });

  revalidatePath("/workspace/mail");
  return { ok: true, address: outcome.record.address, message: AR.saved };
}

/**
 * Availability check.
 *
 * Deliberately weak on purpose: the answer is a boolean with no owner, no
 * timestamp and no suggestion, it needs a session, and it is rate limited per
 * user. A stronger answer ("taken by acme since March") is exactly the
 * enumeration oracle the product must not offer.
 */
export async function checkAvailabilityAction(formData: FormData): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const limit = checkMailLimit("availability", auth.userId);
  if (!limit.allowed) {
    await recordMailAudit({
      repo: createMailRepository(),
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "rate_limited",
      metadata: { reason: "availability" },
    });
    return { ok: false, reason: "throttled", message: AR.limited };
  }

  const check = checkAddress(String(formData.get("address") ?? ""));
  if (!check.ok) {
    return { ok: false, reason: check.reason, message: AR.invalid };
  }

  const existing = await createMailRepository().findAddressByLocalPart(check.localPart);
  return { ok: true, available: existing === null };
}

/** AI summary of one message, stored so a second visit costs nothing. */
export async function summarizeAction(messageId: string): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const limit = checkMailLimit("ai", auth.userId);
  if (!limit.allowed) return { ok: false, reason: "throttled", message: AR.limited };

  const repo = createMailRepository();
  // The tenant is part of the lookup, so a message id from another workspace
  // simply does not exist here.
  const message = await repo.getMessage(auth.organizationId, String(messageId ?? ""));
  if (!message) return { ok: false, reason: "not_found", message: AR.notFound };

  const summary = await summarizeMessage({
    subject: message.subject,
    bodyHtml: message.bodyHtml,
    bodyText: message.bodyText,
    lang: "ar",
  });
  if (!summary) return { ok: false, reason: "unavailable", message: AR.unavailable };

  await repo.setMessageSummary({
    organizationId: auth.organizationId,
    messageId: message.id,
    summary,
  });
  await recordMailAudit({
    repo,
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: "message.summarized",
    targetId: message.id,
  });

  return { ok: true, text: summary, message: AR.summarized };
}

/** Draft suggestion. Returns text only; nothing is sent, nothing is saved yet. */
export async function suggestDraftAction(
  intent: string,
  context?: string
): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const limit = checkMailLimit("ai", auth.userId);
  if (!limit.allowed) return { ok: false, reason: "throttled", message: AR.limited };

  const text = await suggestDraft({ intent, context: context ?? null, lang: "ar" });
  if (!text) return { ok: false, reason: "unavailable", message: AR.unavailable };
  return { ok: true, text };
}

/** Saves a draft. Never sends. */
export async function saveDraftAction(formData: FormData): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const repo = createMailRepository();
  const mailAddressId = String(formData.get("mailAddressId") ?? "");
  const mailbox = await loadMailbox({
    repo,
    organizationId: auth.organizationId,
    mailAddressId,
  });
  if (!mailbox.ok) return { ok: false, reason: "not_found", message: AR.notFound };

  const body = sanitizeHtml(String(formData.get("bodyText") ?? ""), { allowImages: false });
  const draft = await repo.insertDraft({
    organizationId: auth.organizationId,
    mailAddressId: mailbox.value.id,
    userId: auth.userId,
    toAddresses: String(formData.get("to") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 20),
    subject: String(formData.get("subject") ?? "").slice(0, 300),
    bodyText: body,
    aiGenerated: formData.get("aiGenerated") === "1",
  });

  await recordMailAudit({
    repo,
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: "draft.created",
    targetId: draft.id,
    metadata: { aiGenerated: draft.aiGenerated },
  });

  revalidatePath("/workspace/mail");
  return { ok: true, message: AR.draftSaved };
}

/**
 * Sending is refused, twice.
 *
 * Even with the explicit confirmation the UI demands, there is no approved write
 * path, so the action stops and records the attempt. A silent success here would
 * be the most damaging bug this feature could ship.
 */
export async function sendDraftAction(formData: FormData): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const repo = createMailRepository();
  const confirmed = formData.get("confirm") === "SEND";
  await recordMailAudit({
    repo,
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: "draft.send_blocked",
    metadata: { reason: confirmed ? "provider_not_activated" : "no_confirmation" },
  });

  return { ok: false, reason: "send_blocked", message: AR.sendBlocked };
}

/** Moves a message to the archive, tenant checked before the write. */
export async function archiveMessageAction(formData: FormData): Promise<MailActionResult> {
  const auth = await session();
  if (!auth) return { ok: false, reason: "unauthenticated", message: AR.noSession };

  const repo = createMailRepository();
  const mailAddressId = String(formData.get("mailAddressId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");

  const mailbox = await loadMailbox({
    repo,
    organizationId: auth.organizationId,
    mailAddressId,
  });
  if (!mailbox.ok) return { ok: false, reason: "not_found", message: AR.notFound };

  await repo.setMessageFolder({
    organizationId: auth.organizationId,
    messageId,
    folder: "archive",
  });
  await recordMailAudit({
    repo,
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: "message.archived",
    targetId: messageId,
  });

  revalidatePath("/workspace/mail");
  return { ok: true, message: AR.saved };
}

/** Reads one folder. Exported for the page and for the tests. */
export async function readFolder(input: {
  mailAddressId: string;
  folder: string;
  limit?: number;
}) {
  const auth = await session();
  if (!auth) return { ok: false as const, reason: "unauthenticated" };

  const folder = isMailFolder(input.folder) ? input.folder : "inbox";
  const result = await listFolder({
    repo: createMailRepository(),
    organizationId: auth.organizationId,
    mailAddressId: input.mailAddressId,
    folder,
    limit: input.limit,
  });
  if (!result.ok) return { ok: false as const, reason: "not_found" };
  return { ok: true as const, messages: result.value };
}

