import "server-only";

const RELAY_URL =
  "https://solas-89d18e3d.base44.app/functions/zookaMail";
const RELAY_KEY = process.env.ZOOKA_MAIL_KEY ?? "zk-mail-2026-Qp7xV3";
const BASE = "https://zooka-ai.com";

function shell(title: string, body: string, lang: "ar" | "en") {
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html dir="${dir}"><body style="margin:0;background:#0b0f19;padding:32px 12px;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#e5e7eb">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px">
<tr><td style="text-align:center;padding-bottom:20px"><img src="${BASE}/images/zooka-logo-120.png" width="56" height="56" alt="Zooka AI" style="border-radius:12px"><div style="font-size:20px;font-weight:700;margin-top:10px;color:#fff">Zooka AI</div></td></tr>
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
