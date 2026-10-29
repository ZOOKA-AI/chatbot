import { NextResponse } from "next/server";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_DAYS,
  normalizeCode,
  recordReferralEvent,
} from "@/lib/affiliate";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const clean = normalizeCode(code);
  const origin = new URL(request.url).origin;

  if (!clean) {
    return NextResponse.redirect(new URL("/", origin));
  }

  await recordReferralEvent({ code: clean, event: "click" });

  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set(REFERRAL_COOKIE, clean, {
    maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
