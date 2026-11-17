import { NextResponse } from "next/server";

import { isTokenShape } from "@/lib/auth/registration";
import { consumeVerificationToken, markEmailVerified } from "@/lib/auth/verification";
import { onInviteeVerified, releasePending } from "@/lib/growth/referrals";

/**
 * Confirms an email address from a single-use link.
 *
 * Always answers with a redirect to a page, never with JSON detail: the token is
 * the only credential, and the response must say nothing about whether an address
 * exists. Enabled only with AUTH_EMAIL_VERIFICATION=on, because until verification
 * mail has been proven to arrive, issuing tokens would strand real users.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  const back = (state: string) =>
    NextResponse.redirect(new URL(`/login?verify=${state}`, url.origin), 303);

  if (process.env.AUTH_EMAIL_VERIFICATION !== "on") {
    return back("unavailable");
  }
  if (!isTokenShape(token)) {
    return back("invalid");
  }

  try {
    const consumed = await consumeVerificationToken(token);
    if (!consumed.ok) {
      return back("invalid");
    }
    await markEmailVerified(consumed.userId);
    // A verified address makes the member's pending rewards claimable. Best
    // effort: verification must succeed even if the rewards table is down.
    await releasePending(consumed.userId).catch(() => undefined);
    await onInviteeVerified(consumed.userId).catch(() => undefined);
    return back("success");
  } catch {
    return back("error");
  }
}
