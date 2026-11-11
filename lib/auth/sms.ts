import "server-only";

/**
 * SMS delivery for phone sign-in. Two providers are supported and the module
 * stays inert until one of them is configured, so nothing changes for users
 * while the credentials are missing.
 */

export type SmsProvider = "twilio" | "unifonic";

export const smsProvider: SmsProvider | null =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? "twilio"
    : process.env.UNIFONIC_APP_SID
      ? "unifonic"
      : null;

export const phoneLoginEnabled = smsProvider !== null;

export type SendResult = { ok: true } | { ok: false; error: string };

async function sendTwilio(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    return { ok: false, error: "missing_sender" };
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  );
  if (!response.ok) {
    return { ok: false, error: `twilio_${response.status}` };
  }
  return { ok: true };
}

async function sendUnifonic(to: string, body: string): Promise<SendResult> {
  const appSid = process.env.UNIFONIC_APP_SID as string;
  const sender = process.env.UNIFONIC_SENDER_ID;
  if (!sender) {
    return { ok: false, error: "missing_sender" };
  }
  const response = await fetch(
    "https://el.cloud.unifonic.com/rest/SMS/messages",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        AppSid: appSid,
        SenderID: sender,
        Recipient: to.replace(/^\+/, ""),
        Body: body,
      }),
    }
  );
  if (!response.ok) {
    return { ok: false, error: `unifonic_${response.status}` };
  }
  return { ok: true };
}

export async function sendSmsCode({
  to,
  code,
}: {
  to: string;
  code: string;
}): Promise<SendResult> {
  const body = `Zooka AI: رمز الدخول ${code} — صالح 5 دقائق. لا تشاركه مع أحد.`;
  try {
    if (smsProvider === "twilio") {
      return await sendTwilio(to, body);
    }
    if (smsProvider === "unifonic") {
      return await sendUnifonic(to, body);
    }
    return { ok: false, error: "not_configured" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
