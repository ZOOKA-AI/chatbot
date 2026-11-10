import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * تشخيص غير حساس: يثبت أن النسخة المنشورة تحتوي كود الفوترة،
 * وأن متغيرات البيئة موجودة، دون كشف أي قيمة سرية.
 */
export function GET() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  return NextResponse.json({
    ok: true,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    hasPostgresUrl: Boolean(
      process.env.POSTGRES_URL ?? process.env.DATABASE_URL
    ),
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    hasWebhookSecret: Boolean(secret),
    secretFingerprint: secret
      ? createHash("sha256").update(secret).digest("hex").slice(0, 10)
      : null,
  });
}
