import "server-only";

import { resolveEmailBase } from "./base";

const RELAY_URL =
  "https://solas-89d18e3d.base44.app/functions/zookaMail";
// No fallback: a key committed to a public repository is a key anyone can use
// to send mail as Zooka. Without ZOOKA_MAIL_KEY, mail is refused loudly instead.
function relayKey(): string | null {
  const key = process.env.ZOOKA_MAIL_KEY?.trim();
  return key ? key : null;
}
// The canonical origin unless an isolated run explicitly overrides it; see
// resolveEmailBase for why a deployment host must never leak into a mail.
const BASE = resolveEmailBase();

export function renderShell(
  title: string,
  body: string,
  lang: "ar" | "en",
  overrideBase?: string
) {
  const base = overrideBase ?? BASE;
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html dir="${dir}"><body style="margin:0;background:#0b0f19;padding:32px 12px;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#e5e7eb">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px">
<tr><td style="text-align:center;padding-bottom:20px"><table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto"><tr><td width="60" height="60" align="center" valign="middle" style="width:60px;height:60px;background:#16213a;border:1px solid #2f4368;border-radius:16px"><img src="${base}/images/zooka-email-logo.png" width="60" height="60" alt="Zooka AI" style="display:block;width:60px;height:60px;border:0;border-radius:16px"></td></tr></table><div style="font-size:20px;font-weight:700;margin-top:10px;color:#fff;letter-spacing:.2px">Zooka AI</div></td></tr>
<tr><td style="font-size:18px;font-weight:600;color:#fff;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.7;color:#d1d5db">${body}</td></tr>
<tr><td style="padding-top:28px;font-size:12px;color:#6b7280;border-top:1px solid #1f2937;margin-top:24px">Zooka AI · <a href="${base}/privacy" style="color:#9ca3af">${lang === "ar" ? "سياسة الخصوصية" : "Privacy"}</a> · <a href="${base}/contact" style="color:#9ca3af">${lang === "ar" ? "تواصل معنا" : "Contact"}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="text-align:center;margin:24px 0"><a href="${href}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px">${label}</a></p>`;
}

export async function sendMail(to: string, subject: string, html: string) {
  const key = relayKey();
  if (!key) {
    console.error("mail not sent: ZOOKA_MAIL_KEY is not configured");
    return false;
  }
  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, to, subject, html }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function sendWelcomeEmail(to: string, lang: "ar" | "en" = "ar") {
  const ar = lang === "ar";
  const title = ar ? "مرحبًا بك في Zooka AI 👋" : "Welcome to Zooka AI 👋";
  const body = ar
    ? `<p>تم إنشاء حسابك بنجاح. من لوحة التحكم تقدر تبدأ محادثة، تفعّل وضع الوكيل، وتربط تكاملاتك (Google Drive، Gmail، n8n وغيرها) من صفحة الإعدادات.</p>${button(`${BASE}/`, "ابدأ الآن")}<p style="font-size:13px;color:#9ca3af">لو ما كنتش أنت صاحب هذا التسجيل تجاهل هذه الرسالة.</p>`
    : `<p>Your account is ready. Start a chat, switch on agent mode, and connect your integrations (Google Drive, Gmail, n8n and more) from Settings.</p>${button(`${BASE}/`, "Open Zooka AI")}<p style="font-size:13px;color:#9ca3af">If you did not sign up, you can ignore this email.</p>`;
  return sendMail(to, title, renderShell(title, body, lang, BASE));
}

export function sendPasswordResetEmail(
  to: string,
  token: string,
  lang: "ar" | "en" = "ar"
) {
  const ar = lang === "ar";
  const link = `${BASE}/reset-password?token=${encodeURIComponent(token)}`;
  const title = ar ? "إعادة تعيين كلمة المرور" : "Reset your password";
  const body = ar
    ? `<p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك. الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة.</p>${button(link, "تعيين كلمة مرور جديدة")}<p style="font-size:13px;color:#9ca3af">لو ما طلبتش ذلك تجاهل الرسالة؛ كلمة مرورك الحالية لم تتغير.</p>`
    : `<p>We received a request to reset your password. The link is valid for 30 minutes and can be used once.</p>${button(link, "Set a new password")}<p style="font-size:13px;color:#9ca3af">If you did not request this, ignore this email; your password is unchanged.</p>`;
  return sendMail(to, title, renderShell(title, body, lang, BASE));
}

/**
 * Sent to the address that was just registered, when verification is switched on.
 * The link is single use and expires in 24 hours (see lib/auth/verification.ts).
 */
export function sendVerificationEmail(
  to: string,
  token: string,
  lang: "ar" | "en" = "ar"
) {
  const ar = lang === "ar";
  const link = `${BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const title = ar ? "أكّد بريدك الإلكتروني" : "Confirm your email address";
  const body = ar
    ? `<p>لتأكيد بريدك، افتح الرابط التالي. الرابط صالح 24 ساعة ويُستخدم مرة واحدة فقط.</p>${button(link, "تأكيد البريد")}<p style="font-size:13px;color:#9ca3af">لو ما أنشأتش حسابًا، تجاهل هذه الرسالة ولن يُفعَّل شيء.</p>`
    : `<p>Open the link below to confirm your address. It is valid for 24 hours and can be used once.</p>${button(link, "Confirm email")}<p style="font-size:13px;color:#9ca3af">If you did not create an account, ignore this email and nothing will happen.</p>`;
  return sendMail(to, title, renderShell(title, body, lang, BASE));
}

/**
 * Sent to the owner of an address when someone tries to register with it.
 * This is the only place the two registration branches differ, and the difference
 * is inside the mailbox, not in the response.
 */
export function sendExistingAccountNotice(to: string, lang: "ar" | "en" = "ar") {
  const ar = lang === "ar";
  const title = ar ? "محاولة إنشاء حساب ببريدك" : "A sign-up attempt used your email";
  const body = ar
    ? `<p>حاول أحدهم إنشاء حساب جديد بهذا البريد، وهو مسجّل عندنا بالفعل، فلم يُنشأ حساب جديد ولم يتغيّر حسابك.</p>${button(`${BASE}/login`, "تسجيل الدخول")}${button(
        `${BASE}/forgot-password`,
        "نسيت كلمة المرور"
      )}<p style="font-size:13px;color:#9ca3af">لو ما كنتش أنت، لا حاجة لأي إجراء.</p>`
    : `<p>Someone tried to create a new account with this address. It is already registered, so no new account was created and nothing about yours changed.</p>${button(`${BASE}/login`, "Sign in")}${button(
        `${BASE}/forgot-password`,
        "Forgot password"
      )}<p style="font-size:13px;color:#9ca3af">If this was not you, no action is needed.</p>`;
  return sendMail(to, title, renderShell(title, body, lang, BASE));
}
