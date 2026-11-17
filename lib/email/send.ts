import "server-only";

const RELAY_URL =
  "https://solas-89d18e3d.base44.app/functions/zookaMail";
const RELAY_KEY = process.env.ZOOKA_MAIL_KEY ?? "zk-mail-2026-Qp7xV3";
// Absolute links in mail follow the deployment they were sent from, so an
// isolated environment can be acceptance-tested without its links landing on
// the public domain. Production keeps the canonical host as the fallback.
const BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://zooka-ai.com");
// Images are fetched by the recipient's mail client (Gmail's image proxy, Outlook,
// Apple Mail), never by a signed-in browser. Preview deployments sit behind Vercel
// SSO protection, so a logo served from VERCEL_URL comes back as a login redirect
// and renders as a broken image. Static brand assets are identical on every
// deployment, so they always load from the public production origin.
export const EMAIL_ASSET_BASE = "https://zooka-ai.com";

function shell(title: string, body: string, lang: "ar" | "en") {
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html dir="${dir}"><body style="margin:0;background:#0b0f19;padding:32px 12px;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#e5e7eb">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px">
<tr><td style="text-align:center;padding-bottom:20px"><img src="${EMAIL_ASSET_BASE}/images/zooka-logo-120.png" width="56" height="56" alt="ZOOKA-AI" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;border-radius:12px"><div style="font-size:20px;font-weight:700;margin-top:10px;color:#fff">Zooka AI</div></td></tr>
<tr><td style="font-size:18px;font-weight:600;color:#fff;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.7;color:#d1d5db">${body}</td></tr>
<tr><td style="padding-top:28px;font-size:12px;color:#6b7280;border-top:1px solid #1f2937;margin-top:24px">Zooka AI · <a href="${BASE}/privacy" style="color:#9ca3af">${lang === "ar" ? "سياسة الخصوصية" : "Privacy"}</a> · <a href="${BASE}/contact" style="color:#9ca3af">${lang === "ar" ? "تواصل معنا" : "Contact"}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="text-align:center;margin:24px 0"><a href="${href}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px">${label}</a></p>`;
}

export async function sendMail(to: string, subject: string, html: string) {
  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: RELAY_KEY, to, subject, html }),
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
  return sendMail(to, title, shell(title, body, lang));
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
  return sendMail(to, title, shell(title, body, lang));
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
  return sendMail(to, title, shell(title, body, lang));
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
  return sendMail(to, title, shell(title, body, lang));
}
