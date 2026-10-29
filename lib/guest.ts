import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { GUEST_FREE_MESSAGES } from "@/lib/copy";
import { incrementGuestUsage } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export const GUEST_COOKIE = "zooka_guest";

// Clearing cookies must not grant extra free messages, so each IP address is
// also capped per day. The cap is higher than the per-visitor cap so shared
// networks are not locked out after a single visitor.
const GUEST_IP_DAILY_LIMIT = GUEST_FREE_MESSAGES * 5;
const GUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

  if ((await incrementGuestUsage(`guest:${guestId}`)) > GUEST_FREE_MESSAGES) {
    throw new ChatbotError("payment_required:chat");
  }

  if (ip) {
    const day = new Date().toISOString().slice(0, 10);
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
    if (
      (await incrementGuestUsage(`ip:${ipHash}:${day}`)) > GUEST_IP_DAILY_LIMIT
    ) {
      throw new ChatbotError("payment_required:chat");
    }
  }
}
