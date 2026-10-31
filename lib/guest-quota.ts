import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { ipAddress } from "@vercel/functions";
import { cookies } from "next/headers";
import { PLANS } from "@/lib/billing/entitlements";
import { releaseGuestUsage, tryClaimGuestUsage } from "@/lib/db/queries";
import { GUEST_COOKIE, guestDayKey } from "@/lib/guest";

/**
 * Allowance bookkeeping for the public demo.
 *
 * A unit is claimed *before* the model is called and released if the reply dies
 * before its first token, so a dropped connection never costs a visitor one of
 * their ten messages. The claim is a single conditional SQL statement, which is
 * what stops a burst of parallel requests from sailing past the cap.
 */
const LIMIT = PLANS.guest.dailyMessages;
const IP_LIMIT = LIMIT * 4; // shared networks keep working, cookie wiping does not pay
const GUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type GuestHold =
  | { ok: true; id: string; day: string }
  | { ok: false; reason: "exhausted" };

export async function reserveGuestMessage(
  request: Request
): Promise<GuestHold> {
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
  const guestKey = `guest:${guestId}:${day}`;
  const claimed = await tryClaimGuestUsage(guestKey, LIMIT);
  if (claimed === null) {
    return { ok: false, reason: "exhausted" };
  }

  const ip = ipAddress(request);
  let ipKey = "";
  if (ip) {
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
    ipKey = `ip:${ipHash}:${day}`;
    const ipClaimed = await tryClaimGuestUsage(ipKey, IP_LIMIT);
    if (ipClaimed === null) {
      await releaseGuestUsage(guestKey);
      return { ok: false, reason: "exhausted" };
    }
  }

  return { ok: true, id: ipKey ? `${guestKey}|${ipKey}` : guestKey, day };
}

/**
 * Called on the first token. The claim made by `reserveGuestMessage` is already
 * the count, so there is nothing left to write; keeping the call keeps the
 * intent explicit at the call site.
 */
export function commitGuestMessage(_id: string) {
  // no-op on purpose: the unit was counted when it was claimed
}

export async function releaseGuestHold(id: string) {
  for (const key of id.split("|").filter(Boolean)) {
    await releaseGuestUsage(key);
  }
}
