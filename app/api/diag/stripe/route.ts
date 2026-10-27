import { NextResponse } from "next/server";

export async function GET() {
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  const wh = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const pro = process.env.STRIPE_PRICE_PRO ?? "";
  const biz = process.env.STRIPE_PRICE_BUSINESS ?? "";
  return NextResponse.json({
    sk_present: Boolean(sk),
    sk_len: sk.length,
    sk_mode: sk.startsWith("sk_live") ? "live" : sk.startsWith("sk_test") ? "test" : "other",
    sk_suffix: sk.slice(-6),
    wh_present: Boolean(wh),
    wh_len: wh.length,
    pro_present: Boolean(pro),
    pro_suffix: pro.slice(-6),
    biz_present: Boolean(biz),
    biz_suffix: biz.slice(-6),
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
}
