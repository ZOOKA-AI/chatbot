import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { GUEST_FREE_MESSAGES } from "@/lib/copy";
import { getGuestUsage, incrementGuestUsage } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export const GUEST_COOKIE = "zooka_guest";

// Clearing cookies must not grant extra free messages, so each IP address is
// also capped per day. The cap is higher than the per-visitor cap so shared
// networks are not locked out after a single visitor.
const GUEST_IP_DAILY_LIMIT = GUEST_FREE_MESSAGES * 4;

/*
 * The allowance refreshes every day at midnight Dubai time, so a visitor who
 * tried Zooka on Monday still gets a fresh run on Tuesday instead of a dead
 * wall. Both the visitor counter and the per-IP counter are date-scoped.
 */
export function guestDayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function nextGuestResetAt(now = new Date()) {
  const reset = new Date(now);
  reset.setUTCHours(20, 0, 0, 0); // 00:00 Asia/Dubai (UTC+4)
  if (reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset;
}
const GUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function consumeGuestMessage(ip: string | undefined) {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_COOKIE)?.value;
  const guestId =
    existing && GUEST_ID_PATTERN.test(existing) ? existing : randomUUID();

  if (guestId !== existing) {
    cookieStore.set(GUEST_COOKIE, guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const day = guestDayKey();

  if (
    (await incrementGuestUsage(`guest:${guestId}:${day}`)) >
    GUEST_FREE_MESSAGES
  ) {
    throw new ChatbotError("payment_required:chat");
  }

  if (ip) {
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
    if (
      (await incrementGuestUsage(`ip:${ipHash}:${day}`)) > GUEST_IP_DAILY_LIMIT
    ) {
      throw new ChatbotError("payment_required:chat");
    }
  }
}

/*
 * Read-only view of today's allowance for the current visitor, used by the
 * landing demo so a returning visitor sees the real remaining count instead of
 * a hardcoded number.
 */
export async function readGuestQuota() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_COOKIE)?.value;
  const day = guestDayKey();
  const used = existing
    ? await getGuestUsage(`guest:${existing}:${day}`)
    : 0;
  return {
    used: Math.min(used, GUEST_FREE_MESSAGES),
    limit: GUEST_FREE_MESSAGES,
    resetsAt: nextGuestResetAt().toISOString(),
    day,
  };
}
