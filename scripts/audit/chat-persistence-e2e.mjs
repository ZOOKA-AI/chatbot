// API-level end-to-end check of chat persistence against a running dev server.
//
// Zero AI cost: run the server with PLAYWRIGHT=True so the mock models answer.
// Test-only database: ADMIN_URL must be a disposable local Postgres with the
// migrations applied, never a shared or production database (it inserts users).
//
//   PLAYWRIGHT=True AUTH_SECRET=... DATABASE_URL=... npx next dev   (optionally TENANT_RLS_ENABLED=on + DATABASE_URL_TENANT/_SERVICE/_PLATFORM)
//   AUTH_SECRET=... ADMIN_URL=... node scripts/audit/chat-persistence-e2e.mjs <label>
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const postgres = require("postgres");
const { encode } = require("next-auth/jwt");

const label = process.argv[2] ?? "run";
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
if (/supabase|pooler|krzfrsaquvmwctsajhlm|bylfizytgayoefuyliix/.test(process.env.ADMIN_URL ?? "")) {
  throw new Error("refusing to run against a hosted database: use a disposable local Postgres");
}
const sql = postgres(process.env.ADMIN_URL, { max: 2 });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} [${label}] ${name}${detail ? " — " + detail : ""}`);
};

async function makeUser(tag) {
  const email = `audit-${tag}-${label}-${Date.now()}@example.test`;
  const [u] = await sql`insert into "User"(email) values(${email}) returning id`;
  const token = await encode({
    secret: process.env.AUTH_SECRET,
    salt: "authjs.session-token",
    token: { sub: u.id, id: u.id, email, type: "regular" },
  });
  return { id: u.id, cookie: `authjs.session-token=${token}` };
}

async function send(user, chatId, messageId, text) {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: user.cookie },
    body: JSON.stringify({
      id: chatId,
      message: { id: messageId, role: "user", parts: [{ type: "text", text }] },
      selectedChatModel: "openai/gpt-4.1-mini",
      selectedVisibilityType: "private",
    }),
  });
  let body; // drain the stream so onFinish runs
  try { body = await res.text(); } catch (e) { body = "[stream terminated: " + e.message + "]"; }
  return { status: res.status, body };
}

const settle = () => new Promise((r) => setTimeout(r, 2500));

const a = await makeUser("a");
const b = await makeUser("b");
const chatId = randomUUID();
const m1 = randomUUID();

const r1 = await send(a, chatId, m1, "hello audit one");
check("POST /api/chat returns 200", r1.status === 200, `status ${r1.status}`);
check("assistant reply streamed to the client", r1.body.includes("text-delta") && r1.body.includes("How"));
await settle();

const rows = await sql`select id, role, parts from "Message_v2" where "chatId" = ${chatId} order by "createdAt"`;
check("user message stored", rows.some((r) => r.id === m1 && r.role === "user"));
check("assistant message stored with the model's reply", rows.some((r) => r.role === "assistant" && JSON.stringify(r.parts).includes("How can I help")), `rows ${rows.length}`);
const [chat] = await sql`select "userId", "organizationId" from "Chat" where id = ${chatId}`;
check("chat owned by user A", chat?.userId === a.id);
const usage = await sql`select event as type from "UsageEvent" where "userId" = ${a.id}`;
const chatUsage = usage.filter((u) => u.type === "chat_message").length;
check("usage: exactly one chat_message event", chatUsage === 1, `events ${JSON.stringify(usage.map((u) => u.type))}`);

// history API shows both
const hist = await fetch(`${base}/api/messages?chatId=${chatId}`, { headers: { cookie: a.cookie } }).catch(() => null);
if (hist && hist.status !== 404) {
  const text = await hist.text();
  check("history endpoint returns both messages", hist.status === 200 && text.includes("hello audit one") && text.includes("How can I help"), `status ${hist.status}`);
} else {
  const page = await fetch(`${base}/chat/${chatId}`, { headers: { cookie: a.cookie } });
  const html = await page.text();
  check("chat page renders both messages", page.status === 200 && html.includes("hello audit one") && html.includes("How can I help"), `status ${page.status}`);
}

// duplicate: resend the same message id
const r2 = await send(a, chatId, m1, "hello audit one");
await settle();
const userRows = await sql`select count(*)::int c from "Message_v2" where id = ${m1}`;
check("resending same message id creates no duplicate user row", userRows[0].c === 1, `status ${r2.status}`);

// second turn
const r3 = await send(a, chatId, randomUUID(), "hello audit two");
await settle();
const after = await sql`select role from "Message_v2" where "chatId" = ${chatId}`;
check("second turn persisted", r3.status === 200 && after.filter((r) => r.role === "assistant").length >= 2, `assistant rows ${after.filter((r) => r.role === "assistant").length}`);

// tenant ownership: user B writes into A's chat
const before = (await sql`select count(*)::int c from "Message_v2" where "chatId" = ${chatId}`)[0].c;
const rb = await send(b, chatId, randomUUID(), "hello intruder");
await settle();
const afterB = (await sql`select count(*)::int c from "Message_v2" where "chatId" = ${chatId}`)[0].c;
check("other user cannot post into the chat (403, no rows)", rb.status === 403 && afterB === before, `status ${rb.status}, rows ${before}->${afterB}`);
const pb = await fetch(`${base}/chat/${chatId}`, { headers: { cookie: b.cookie }, redirect: "manual" });
const pbt = await pb.text();
check("other user cannot read the chat", !pbt.includes("hello audit one"), `status ${pb.status}`);

// unauthenticated
const ru = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check("unauthenticated POST rejected", ru.status >= 400, `status ${ru.status}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`SUMMARY [${label}] passed=${results.length - failed} failed=${failed}`);
await sql.end();
process.exit(failed ? 1 : 0);
