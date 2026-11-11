import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";

/**
 * Login by phone: a six-digit code is stored hashed, verified once, and then
 * exchanged for a short-lived signed ticket that NextAuth accepts. The ticket
 * means the OTP itself never travels through the sign-in callback.
 */

const CODE_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const MAX_PER_PHONE = 3;
const MAX_PER_IP = 12;
const TICKET_TTL_SECONDS = 120;

function secret(): string {
  return (
    process.env.OTP_HASH_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "zooka-otp-fallback-secret"
  );
}

function digest(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Local UAE numbers start with 0 and become +971; anything else needs a prefix. */
export function normalizePhone(raw: string): string | null {
  const compact = (raw ?? "").replace(/[\s\-()]/g, "");
  if (!/^\+?\d{7,15}$/.test(compact)) {
    return null;
  }
  if (compact.startsWith("+")) {
    return compact;
  }
  if (compact.startsWith("00")) {
    return `+${compact.slice(2)}`;
  }
  if (compact.startsWith("0")) {
    return `+971${compact.slice(1)}`;
  }
  return `+${compact}`;
}

/** Phone accounts still need the email column, so we derive a stable placeholder. */
export function emailForPhone(phone: string): string {
  return `phone.${phone.replace(/\D/g, "")}@phone.zooka-ai.com`;
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "PhoneOtp" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone varchar(32) NOT NULL,
      code_hash varchar(64) NOT NULL,
      ip varchar(64),
      attempts integer NOT NULL DEFAULT 0,
      consumed_at timestamptz,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_created_idx"
      ON "PhoneOtp" (phone, created_at DESC)`);
  schemaReady = true;
}

export type IssueCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "rate_limited" | "unavailable" };

export async function issuePhoneCode({
  phone,
  ip,
}: {
  phone: string;
  ip: string | null;
}): Promise<IssueCodeResult> {
  try {
    await ensureSchema();

    const phoneRows = (await db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total
      FROM "PhoneOtp"
      WHERE phone = ${phone}
        AND created_at > now() - (${WINDOW_MINUTES} || ' minutes')::interval
    `)) as unknown as { total: number }[];
    if ((phoneRows[0]?.total ?? 0) >= MAX_PER_PHONE) {
      return { ok: false, reason: "rate_limited" };
    }

    if (ip) {
      const ipRows = (await db.execute<{ total: number }>(sql`
        SELECT count(*)::int AS total
        FROM "PhoneOtp"
        WHERE ip = ${ip}
          AND created_at > now() - (${WINDOW_MINUTES} || ' minutes')::interval
      `)) as unknown as { total: number }[];
      if ((ipRows[0]?.total ?? 0) >= MAX_PER_IP) {
        return { ok: false, reason: "rate_limited" };
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.execute(sql`
      INSERT INTO "PhoneOtp" (phone, code_hash, ip, expires_at)
      VALUES (
        ${phone},
        ${digest(code)},
        ${ip},
        now() + (${CODE_TTL_MINUTES} || ' minutes')::interval
      )`);
    return { ok: true, code };
  } catch (error) {
    console.error("[auth] issuePhoneCode failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, reason: "unavailable" };
  }
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

export async function verifyPhoneCode({
  phone,
  code,
}: {
  phone: string;
  code: string;
}): Promise<VerifyCodeResult> {
  if (!/^\d{6}$/.test(code ?? "")) {
    return { ok: false, reason: "invalid" };
  }
  try {
    await ensureSchema();
    const rows = (await db.execute<{
      id: string;
      code_hash: string;
      attempts: number;
    }>(sql`
      SELECT id, code_hash, attempts
      FROM "PhoneOtp"
      WHERE phone = ${phone} AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `)) as unknown as { id: string; code_hash: string; attempts: number }[];

    const row = rows[0];
    if (!row) {
      return { ok: false, reason: "expired" };
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return { ok: false, reason: "too_many_attempts" };
    }

    if (!safeEqual(row.code_hash, digest(code))) {
      await db.execute(sql`
        UPDATE "PhoneOtp" SET attempts = attempts + 1 WHERE id = ${row.id}`);
      return { ok: false, reason: "invalid" };
    }

    const updated = (await db.execute<{ id: string }>(sql`
      UPDATE "PhoneOtp"
      SET consumed_at = now()
      WHERE id = ${row.id} AND consumed_at IS NULL
      RETURNING id
    `)) as unknown as { id: string }[];
    if (updated.length === 0) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[auth] verifyPhoneCode failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, reason: "expired" };
  }
}

/** Short-lived proof that this phone passed the code check. */
export function createLoginTicket(phone: string): string {
  const expires = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
  const signature = digest(`${phone}.${expires}`);
  return `${phone}.${expires}.${signature}`;
}

export function readLoginTicket(ticket: string): string | null {
  const parts = (ticket ?? "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [phone, expires, signature] = parts;
  const expiresAt = Number(expires);
  if (!phone || !Number.isFinite(expiresAt)) {
    return null;
  }
  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (!safeEqual(signature, digest(`${phone}.${expires}`))) {
    return null;
  }
  return phone;
}
