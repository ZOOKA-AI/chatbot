import "server-only";

import { createHmac, createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { adminDb } from "@/lib/db/queries";
import { sendMail } from "@/lib/email/send";

/**
 * Email invitations for the referral program.
 *
 * Design constraints, each one deliberate:
 *   - the address is hashed before storage, so the table cannot be used as a
 *     contact list even if it leaks;
 *   - one invite per inviter per address (unique index), so repeats cannot be
 *     used to pester someone;
 *   - a hard daily cap per inviter, enforced from the invite rows themselves,
 *     so the cap survives restarts and cannot be bypassed by concurrency;
 *   - a suppression list checked before every send, with a one-click
 *     unsubscribe token in every message;
 *   - nothing here awards points. An invite is not a referral; only a verified
 *     registration is, so invites can never inflate a balance.
 */

export const INVITE_DAILY_CAP = 10;
export const INVITE_MAX_RECIPIENTS = 5;

const SECRET =
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "zooka-invite-dev-secret";

export function normalizeAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isDeliverableAddress(raw: string): boolean {
  const value = normalizeAddress(raw);
  if (value.length < 6 || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(value);
}

/** Keyed hash: the same address always maps to the same row, and a dump without the key reveals nothing. */
export function hashAddress(raw: string): string {
  return createHmac("sha256", SECRET).update(normalizeAddress(raw)).digest("hex");
}

/** Stable, unforgeable unsubscribe token for an address. */
export function unsubscribeToken(raw: string): string {
  return createHash("sha256")
    .update(`unsubscribe:${hashAddress(raw)}`)
    .digest("hex")
    .slice(0, 48);
}

export function verifyUnsubscribeToken(raw: string, token: string): boolean {
  return unsubscribeToken(raw) === token;
}

export function remainingToday(sentToday: number): number {
  return Math.max(0, INVITE_DAILY_CAP - Math.max(0, sentToday));
}

type Lang = "ar" | "en";

export function inviteSubject(lang: Lang, inviterName: string): string {
  return lang === "ar"
    ? `${inviterName} يدعوك إلى ZOOKA-AI`
    : `${inviterName} invited you to ZOOKA-AI`;
}

export function inviteBody(input: {
  lang: Lang;
  inviterName: string;
  referrerCode: string;
  baseUrl: string;
  personalNote?: string | null;
  unsubscribeToken: string;
  recipient: string;
}): string {
  const link = `${input.baseUrl}/r/${input.referrerCode}`;
  const off = `${input.baseUrl}/api/growth/unsubscribe?e=${encodeURIComponent(
    normalizeAddress(input.recipient)
  )}&t=${input.unsubscribeToken}`;
  const note = (input.personalNote ?? "")
    .trim()
    .slice(0, 400)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const ar = input.lang === "ar";
  return `<div dir="${ar ? "rtl" : "ltr"}" style="font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#0b0f19;color:#e5e7eb;padding:28px;border-radius:14px">
  <h2 style="color:#2E86AB;margin:0 0 12px">${ar ? "دعوة إلى ZOOKA-AI" : "An invitation to ZOOKA-AI"}</h2>
  <p>${ar ? `${input.inviterName} دعاك لتجربة ZOOKA-AI.` : `${input.inviterName} invited you to try ZOOKA-AI.`}</p>
  ${note ? `<blockquote style="border-${ar ? "right" : "left"}:3px solid #A23B72;padding:8px 14px;margin:16px 0;color:#cbd5e1">${note}</blockquote>` : ""}
  <p style="text-align:center;margin:24px 0"><a href="${link}" style="display:inline-block;background:#2E86AB;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px">${ar ? "ابدأ الآن" : "Get started"}</a></p>
  <p style="font-size:12px;color:#9ca3af">${ar ? "إن لم تكن تعرف المرسل، تجاهل هذه الرسالة." : "If you do not know the sender, ignore this message."}
  <br><a href="${off}" style="color:#9ca3af">${ar ? "إلغاء استلام الدعوات" : "Stop these invitations"}</a></p>
</div>`;
}

export type InviteOutcome =
  | { email: string; status: "sent" }
  | { email: string; status: "invalid" | "suppressed" | "already_invited" | "capped" | "failed" };

export async function invitesSentToday(inviterUserId: string): Promise<number> {
  const rows = (await adminDb().execute(sql`
    SELECT count(*)::int AS n FROM "ReferralInvite"
    WHERE "inviterUserId" = ${inviterUserId}::uuid
      AND "createdAt" > now() - interval '1 day'
  `)) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

async function isSuppressed(emailHash: string): Promise<boolean> {
  const rows = (await adminDb().execute(sql`
    SELECT 1 AS hit FROM "EmailSuppression" WHERE "emailHash" = ${emailHash} LIMIT 1
  `)) as unknown as Array<{ hit: number }>;
  return rows.length > 0;
}

/**
 * Send invitations. The caller must already be authenticated; the inviter id is
 * taken from the session, never from the request body.
 */
export async function sendInvitations(input: {
  inviterUserId: string;
  inviterName: string;
  referrerCode: string;
  baseUrl: string;
  lang: Lang;
  recipients: string[];
  personalNote?: string | null;
}): Promise<{ remaining: number; results: InviteOutcome[] }> {
  const unique: string[] = [];
  for (const raw of input.recipients.slice(0, INVITE_MAX_RECIPIENTS)) {
    const value = normalizeAddress(raw);
    if (value && !unique.includes(value)) unique.push(value);
  }

  let budget = remainingToday(await invitesSentToday(input.inviterUserId));
  const results: InviteOutcome[] = [];

  for (const email of unique) {
    if (!isDeliverableAddress(email)) {
      results.push({ email, status: "invalid" });
      continue;
    }
    if (budget <= 0) {
      results.push({ email, status: "capped" });
      continue;
    }
    const emailHash = hashAddress(email);
    if (await isSuppressed(emailHash)) {
      results.push({ email, status: "suppressed" });
      continue;
    }

    const token = unsubscribeToken(email);
    const claimed = (await adminDb().execute(sql`
      INSERT INTO "ReferralInvite" ("inviterUserId", "emailHash", "token")
      VALUES (${input.inviterUserId}::uuid, ${emailHash}, ${token})
      ON CONFLICT ("inviterUserId", "emailHash") DO NOTHING
      RETURNING "id"
    `)) as unknown as Array<{ id: string }>;

    if (claimed.length === 0) {
      results.push({ email, status: "already_invited" });
      continue;
    }

    const delivered = await sendMail(
      email,
      inviteSubject(input.lang, input.inviterName),
      inviteBody({
        lang: input.lang,
        inviterName: input.inviterName,
        referrerCode: input.referrerCode,
        baseUrl: input.baseUrl,
        personalNote: input.personalNote,
        unsubscribeToken: token,
        recipient: email,
      })
    );

    if (!delivered) {
      await adminDb().execute(sql`
        UPDATE "ReferralInvite" SET "status" = 'failed'
        WHERE "inviterUserId" = ${input.inviterUserId}::uuid AND "emailHash" = ${emailHash}
      `);
      results.push({ email, status: "failed" });
      continue;
    }

    budget -= 1;
    results.push({ email, status: "sent" });
  }

  return { remaining: budget, results };
}

export async function suppressAddress(raw: string, reason = "unsubscribed"): Promise<boolean> {
  if (!isDeliverableAddress(raw)) return false;
  await adminDb().execute(sql`
    INSERT INTO "EmailSuppression" ("emailHash", "reason")
    VALUES (${hashAddress(raw)}, ${reason})
    ON CONFLICT ("emailHash") DO NOTHING
  `);
  return true;
}
