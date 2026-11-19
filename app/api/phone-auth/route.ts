import { NextResponse } from "next/server";
import {
  createLoginTicket,
  issuePhoneCode,
  normalizePhone,
  verifyPhoneCode,
} from "@/lib/auth/phone-otp";
import { phoneLoginEnabled, sendSmsCode } from "@/lib/auth/sms";

/**
 * Two steps: request a code for a phone number, then verify it and receive a
 * short-lived ticket that the phone-otp credentials provider can exchange.
 * Nothing is issued while no SMS provider is configured.
 */
export async function POST(request: Request) {
  if (!phoneLoginEnabled) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let payload: { action?: string; phone?: string; code?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const phone = normalizePhone(String(payload.phone ?? ""));
  if (!phone) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  if (payload.action === "request") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const issued = await issuePhoneCode({ phone, ip });
    if (!issued.ok) {
      return NextResponse.json(
        { error: issued.reason },
        { status: issued.reason === "rate_limited" ? 429 : 500 }
      );
    }
    const sent = await sendSmsCode({ to: phone, code: issued.code });
    if (!sent.ok) {
      console.error("[auth] sms send failed", { error: sent.error });
      return NextResponse.json({ error: "sms_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.action === "verify") {
    const verified = await verifyPhoneCode({
      phone,
      code: String(payload.code ?? "").trim(),
    });
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.reason },
        { status: verified.reason === "too_many_attempts" ? 429 : 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      phone,
      ticket: createLoginTicket(phone),
    });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
