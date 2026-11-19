import { NextResponse } from "next/server";

/**
 * Masked WhatsApp entry point.
 *
 * The support number lives ONLY in the deployment environment
 * (SUPPORT_WHATSAPP_PHONE), never in this repository and never in page HTML,
 * so nobody can read, copy or dial it from the public site. Visitors click
 * /wa and land in the chat directly.
 *
 * If the variable is missing we send the visitor to the contact page instead
 * of shipping a broken link.
 */
const PREFILL = "\u0645\u0631\u062d\u0628\u064b\u0627\u060c \u0639\u0627\u064a\u0632 \u0623\u0639\u0631\u0641 \u0628\u0627\u0642\u0627\u062a ZOOKA AI \u0648\u0627\u0644\u062a\u0633\u0639\u064a\u0631.";

export function GET() {
  const digits = (process.env.SUPPORT_WHATSAPP_PHONE || "").replace(/[^0-9]/g, "");
  if (!digits) {
    return NextResponse.redirect("https://zooka-ai.com/contact", 302);
  }
  return NextResponse.redirect(
    `https://wa.me/${digits}?text=${encodeURIComponent(PREFILL)}`,
    302
  );
}
