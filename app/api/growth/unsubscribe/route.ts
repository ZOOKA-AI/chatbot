import { NextResponse } from "next/server";

import { suppressAddress, verifyUnsubscribeToken } from "@/lib/growth/invites";

/**
 * One-click unsubscribe. It needs no session on purpose: the whole point of the
 * link is that it works from someone who has no account here. The token is
 * derived from the address, so a forged pair simply fails verification.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  const done = await suppressAddress(email, "unsubscribed");
  if (!done) {
    return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
  }

  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<title>تم إلغاء الاشتراك</title>
<body style="font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#0b0f19;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:460px;text-align:center;padding:32px;background:#111827;border:1px solid #1f2937;border-radius:16px">
<h1 style="color:#2E86AB;font-size:20px;margin:0 0 12px">تم إلغاء استلام الدعوات</h1>
<p style="color:#9ca3af;font-size:14px;margin:0">لن نرسل أي دعوة أخرى إلى هذا العنوان. /
This address will not receive further invitations.</p>
</div></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
