#!/usr/bin/env node
/**
 * مصفوفة جاهزية التكاملات: تقارن ما يعلنه كتالوج المنتج بحقيقة الكود
 * والمتغيرات المطلوبة. التشغيل: node scripts/integration-readiness.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function walk(dir, fileList = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, fileList);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) fileList.push(full);
  }
  return fileList;
}

const files = walk(join(root, "lib")).concat(walk(join(root, "app")));
const corpus = files.map((f) => `//FILE:${f}\n${readFileSync(f, "utf8")}`).join("\n");

const providersSrc = readFileSync(join(root, "lib/integrations/providers.ts"), "utf8");
const providers = [...providersSrc.matchAll(/\{\s*id:\s*"([a-z0-9_]+)"[\s\S]*?status:\s*"([a-z_]+)"[\s\S]*?managed:\s*(true|false)/g)]
  .map((m) => ({ id: m[1], status: m[2], managed: m[3] === "true" }));

/** المتغيرات التي يحتاجها كل تكامل ليعمل فعلاً في الإنتاج. */
const REQUIRED_ENV = {
  gmail: ["GOOGLE_LOGIN_CLIENT_ID", "GOOGLE_LOGIN_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"],
  google_drive: ["GOOGLE_LOGIN_CLIENT_ID", "GOOGLE_LOGIN_CLIENT_SECRET", "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY"],
  google_calendar: ["GOOGLE_LOGIN_CLIENT_ID", "GOOGLE_LOGIN_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"],
  github: ["GITHUB_TOKEN"],
  vercel: ["VERCEL_TOKEN"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_BUSINESS"],
  n8n: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET"],
  whatsapp: ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  meta: ["META_APP_ID", "META_APP_SECRET", "META_PAGE_ACCESS_TOKEN"],
  instagram: ["META_APP_ID", "META_APP_SECRET", "INSTAGRAM_ACCESS_TOKEN"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  supabase: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  google_maps: ["GOOGLE_MAPS_API_KEY"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
  notion: ["NOTION_TOKEN"],
  slack: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
  shopify: ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"],
  google_ads: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"],
  google_business: ["GOOGLE_LOGIN_CLIENT_ID", "GOOGLE_LOGIN_CLIENT_SECRET"],
  snapchat: ["SNAPCHAT_CLIENT_ID", "SNAPCHAT_CLIENT_SECRET"],
  plaid: ["PLAID_CLIENT_ID", "PLAID_SECRET"],
  amadeus: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"],
  booking: ["BOOKING_API_KEY"],
  agora: ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"],
};

const codeRefs = (id) => (corpus.match(new RegExp(`["'\`/]${id}[/"'\`.]`, "g")) || []).length;
const wired = (id) => files.some((f) => f.toLowerCase().includes(`/${id.replace(/_/g, "-")}`)) || codeRefs(id) >= 3;

const rows = providers.map((p) => {
  const env = REQUIRED_ENV[p.id] ?? [];
  const configured = env.filter((key) => !!process.env[key]);
  return {
    id: p.id,
    status: p.status,
    managed: p.managed,
    wired: wired(p.id),
    needs: env.length,
    configuredInThisShell: configured.length,
    missing: env.filter((key) => !process.env[key]),
  };
});

const pad = (v, n) => String(v).padEnd(n);
console.log(`${pad("provider", 16)}${pad("catalog", 12)}${pad("code", 7)}${pad("shell env", 10)}missing keys (production)`.replace("shell env", "env*"));
console.log("-".repeat(96));
console.log("* عمود env يقرأ هذه الجلسة فقط، وليس أسرار الإنتاج. الحكم على الإنتاج من الفحص الحيّ، لا من هذا العمود.\n");
for (const row of rows.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id))) {
  console.log(
    `${pad(row.id, 16)}${pad(row.status, 12)}${pad(row.wired ? "yes" : "no", 7)}${pad(`${row.configuredInThisShell}/${row.needs}`, 8)}${row.missing.join(", ") || "—"}`
  );
}

const claimed = rows.filter((r) => ["available", "beta"].includes(r.status));
const broken = claimed.filter((r) => !r.wired || r.needs === 0);
console.log(`\nمعلن كجاهز أو تجريبي: ${claimed.length} | منها بلا تنفيذ حقيقي: ${broken.length}`);
if (broken.length) console.log(`بلا تنفيذ: ${broken.map((r) => r.id).join(", ")}`);
