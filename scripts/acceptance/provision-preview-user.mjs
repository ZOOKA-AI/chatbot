/**
 * Provisions the dedicated Preview acceptance account inside the isolated
 * Neon Preview database (authorization #PREVIEW-NEON-001).
 *
 * It never prints the password or the connection string. The generated
 * password is written to the agent vault (logins_index.preview_test_account)
 * so the hosted journey harness can read it without a shell history entry.
 *
 *   node scripts/acceptance/provision-preview-user.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { hashSync, genSaltSync } from "bcrypt-ts";

const VAULT = "/app/.agents/vault.json";
const EMAIL = process.env.PREVIEW_TEST_EMAIL || "qa.preview@zooka-ai.test";

const vault = JSON.parse(readFileSync(VAULT, "utf8"));
const entry = vault?.logins_index?.neon_zooka_ai_preview;
const url = entry?.url_pooled || entry?.url_direct;
if (!url) {
  console.error("FAIL no Neon preview connection string in the vault");
  process.exit(2);
}
if (/krzfrsaquvmwctsajhlm|bylfizytgayoefuyliix/.test(url)) {
  console.error("FAIL refusing to touch a production host");
  process.exit(3);
}

const password = randomBytes(18).toString("base64url");
const hash = hashSync(password, genSaltSync(10));
const sql = neon(url);

const existing = await sql`select id from "User" where email = ${EMAIL}`;
let userId;
if (existing.length > 0) {
  const rows = await sql`update "User" set password = ${hash}, "emailVerifiedAt" = now()
    where email = ${EMAIL} returning id`;
  userId = rows[0].id;
  console.log(`UPDATED existing preview account, id length ${userId.length}`);
} else {
  const rows = await sql`insert into "User" (email, password, "emailVerifiedAt")
    values (${EMAIL}, ${hash}, now()) returning id`;
  userId = rows[0].id;
  console.log(`CREATED preview account, id length ${userId.length}`);
}

const counts = await sql`select
  (select count(*) from "User") as users,
  (select count(*) from "Organization") as organizations,
  (select count(*) from "OrganizationMember") as members`;
console.log("DB counts:", JSON.stringify(counts[0]));

copyFileSync(VAULT, `${VAULT}.bak-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`);
vault.logins_index.preview_test_account = {
  service: "ZOOKA-AI Preview (Neon zooka-ai-preview)",
  email: EMAIL,
  password,
  user_id: userId,
  note: "Dedicated hosted-acceptance account created by the agent under #PREVIEW-NEON-001. Preview only, never production.",
  created_at: new Date().toISOString(),
};
writeFileSync(VAULT, JSON.stringify(vault, null, 1));
console.log("VAULT saved: logins_index.preview_test_account (values not printed)");
console.log(`BASE_URL=https://chatbot-git-release-rc-1-zooka-ai1.vercel.app`);
