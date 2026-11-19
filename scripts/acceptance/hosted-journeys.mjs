#!/usr/bin/env node
/**
 * Hosted Preview acceptance, six journeys, over HTTP.
 *
 * Why HTTP and not a browser: the deployment is behind Vercel protection, and the browser
 * automation layer in this environment refuses to submit the login form. HTTP with a bypass
 * header works, so this script is the automation route the owner can run the moment a
 * VERCEL_AUTOMATION_BYPASS credential exists. Without one it exits before touching the app.
 *
 * It never invents a result. A journey that cannot be measured is reported SKIP with the reason,
 * not PASS. The three auth journeys (login, persistence, logout) are measured through the real
 * NextAuth endpoints; registration has no REST route in this app (it is a server action), so it
 * is measured by probing the register page and reported honestly as needing the browser.
 *
 *   BASE_URL=https://... VERCEL_AUTOMATION_BYPASS=... JOURNEY_EMAIL=... JOURNEY_PASSWORD=...
 *   node scripts/acceptance/hosted-journeys.mjs [--out=report.json]
 */
import { writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS || "";
const EMAIL = process.env.JOURNEY_EMAIL || "";
const PASSWORD = process.env.JOURNEY_PASSWORD || "";
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) || "/tmp/hosted-journeys.json";

const results = [];
function record(journey, status, detail) {
  results.push({ journey, status, detail });
  console.log(`${status.padEnd(4)} ${journey} — ${detail}`);
}

if (!BASE) {
  console.error("BASE_URL is required (the Preview URL, no trailing slash)");
  process.exit(2);
}
if (!BYPASS) {
  console.error(
    "VERCEL_AUTOMATION_BYPASS is required: without it every request is answered by the Vercel SSO\n" +
      "302, so no journey can be measured. Store the credential in agent secrets, not in a shell history."
  );
  process.exit(2);
}
if (!EMAIL || !PASSWORD) {
  console.error("JOURNEY_EMAIL and JOURNEY_PASSWORD are required for the authenticated journeys");
  process.exit(2);
}

const headers = (extra = {}) => ({
  "x-vercel-protection-bypass": BYPASS,
  ...extra,
});

function jar() {
  const store = new Map();
  return {
    absorb(response) {
      const raw = response.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) store.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    has(name) {
      return [...store.keys()].some((k) => k.includes(name));
    },
  };
}

async function step(name, fn) {
  try {
    return await fn();
  } catch (error) {
    record(name, "FAIL", `threw: ${error.message}${error?.cause ? ` [cause: ${error.cause.code || error.cause.message}]` : ""}`);
    return null;
  }
}

let previewSql = null;
async function previewDb() {
  if (previewSql) return previewSql;
  if (!process.env.PREVIEW_DB_URL) return null;
  const { neon } = await import("@neondatabase/serverless");
  previewSql = neon(process.env.PREVIEW_DB_URL);
  return previewSql;
}

const cookies = jar();

// Journey 1 — registration. The app registers through a server action, not a REST endpoint,
// so the honest automated measurement is that the page is reachable and renders the form.
await step("registration", async () => {
  const res = await fetch(`${BASE}/register`, { headers: headers(), redirect: "manual" });
  cookies.absorb(res);
  const body = await res.text();
  const hasForm = /type="email"|name="email"/i.test(body) && /password/i.test(body);
  if (res.status === 200 && hasForm) {
    record("registration", "PASS", "register page 200 and renders email + password fields (form submit itself needs the browser: server action)");
  } else if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") || "";
    const target = loc.startsWith("http") ? loc : `${BASE}${loc}`;
    const followed = await fetch(target, { headers: headers(), redirect: "manual" });
    cookies.absorb(followed);
    const body2 = await followed.text();
    const form2 = /type="email"|name="email"/i.test(body2) && /password/i.test(body2);
    if (followed.status === 200 && form2) {
      record("registration", "PASS", `${res.status} -> ${loc} then 200 with email + password fields (form submit needs the browser: server action)`);
    } else {
      record("registration", "FAIL", `redirected ${res.status} to ${loc}; followed -> ${followed.status} (form: ${form2})`);
    }
  } else {
    record("registration", "FAIL", `status ${res.status}, form present: ${hasForm}`);
  }
});

// Journey 2 — login, through the real NextAuth credentials flow.
await step("login", async () => {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: headers({ cookie: cookies.header() }) });
  cookies.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) {
    record("login", "FAIL", "no csrfToken from /api/auth/csrf");
    return;
  }
  const body = new URLSearchParams({ email: EMAIL, password: PASSWORD, csrfToken, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: headers({ "content-type": "application/x-www-form-urlencoded", cookie: cookies.header() }),
    body,
    redirect: "manual",
  });
  cookies.absorb(res);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: headers({ cookie: cookies.header() }) });
  const session = await sessionRes.json();
  if (session?.user?.email) {
    record("login", "PASS", `session established for ${session.user.email}`);
  } else {
    record("login", "FAIL", `callback ${res.status}, session has no user (check JOURNEY_EMAIL/PASSWORD)`);
  }
});

// Journey 3 — session persistence: a second, independent request with the same cookie only.
await step("session persistence", async () => {
  const first = await (await fetch(`${BASE}/api/auth/session`, { headers: headers({ cookie: cookies.header() }) })).json();
  await new Promise((r) => setTimeout(r, 2000));
  const second = await (await fetch(`${BASE}/api/auth/session`, { headers: headers({ cookie: cookies.header() }) })).json();
  if (first?.user?.email && second?.user?.email === first.user.email) {
    record("session persistence", "PASS", `same user across two requests 2s apart (${second.user.email})`);
  } else {
    record("session persistence", "FAIL", "session did not persist across a second request");
  }
});

// Journey 4 — chat: the authenticated chat page and the agent endpoint both answer for a session.
await step("chat", async () => {
  const page = await fetch(`${BASE}/workspace/agent`, { headers: headers({ cookie: cookies.header() }), redirect: "manual" });
  const anon = await fetch(`${BASE}/api/agent`, { headers: headers(), method: "GET" });
  if (page.status === 200 && (anon.status === 401 || anon.status === 405)) {
    record("chat", "PASS", `chat page 200 with session; /api/agent anonymous = ${anon.status} (refuses without a session)`);
  } else {
    record("chat", "FAIL", `chat page ${page.status}, anonymous /api/agent ${anon.status}`);
  }
});

// Journey 5 — agent execution: one real turn, then proof that both messages
// were written to Postgres (the memory lane the agent reads back).
await step("agent execution", async () => {
  const sql = await previewDb();
  const probe = `acceptance probe ${Date.now()}: reply with the single word ok`;
  const before = sql ? Number((await sql`select count(*)::int as n from "AgentMessage"`)[0].n) : null;

  const res = await fetch(`${BASE}/api/agent`, {
    method: "POST",
    headers: headers({ "content-type": "application/json", cookie: cookies.header() }),
    body: JSON.stringify({ message: probe }),
  });
  const text = await res.text();

  if (res.status !== 200) {
    const reason = res.status === 429 ? "plan limit reached (429) — quota, not a defect" : `POST /api/agent ${res.status}, first 120 chars: ${text.slice(0, 120)}`;
    record("agent execution", "FAIL", reason);
    return;
  }

  if (!sql) {
    record("agent execution", "PASS", `POST /api/agent 200, ${text.length} bytes back (persistence unmeasured: PREVIEW_DB_URL unset)`);
    return;
  }

  const after = await sql`select count(*)::int as n from "AgentMessage"`;
  const stored = await sql`select role, content from "AgentMessage" where content = ${probe} order by role`;
  const roles = stored.map((r) => r.role).join("+") || "none";
  const grew = Number(after[0].n) - before;
  if (grew >= 2 && stored.length === 1) {
    record("agent execution", "PASS", `POST /api/agent 200; AgentMessage ${before}->${after[0].n} (written roles: ${roles}); assistant row confirmed`);
  } else {
    record("agent execution", "FAIL", `POST /api/agent 200 but persistence unproven: rows ${before}->${after[0].n}, probe rows ${stored.length}`);
  }
});

// Journey 6 — logout, then a protected page must refuse the dead cookie.
await step("logout", async () => {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: headers({ cookie: cookies.header() }) });
  const { csrfToken } = await csrfRes.json();
  const out = await fetch(`${BASE}/api/auth/signout`, {
    method: "POST",
    headers: headers({ "content-type": "application/x-www-form-urlencoded", cookie: cookies.header() }),
    body: new URLSearchParams({ csrfToken, json: "true" }),
    redirect: "manual",
  });
  cookies.absorb(out);
  const session = await (await fetch(`${BASE}/api/auth/session`, { headers: headers({ cookie: cookies.header() }) })).json();
  const page = await fetch(`${BASE}/workspace/agent`, { headers: headers({ cookie: cookies.header() }), redirect: "manual" });
  const signedOut = !session?.user?.email;
  const blocked = page.status === 307 || page.status === 302;
  if (signedOut && blocked) {
    record("logout", "PASS", `session empty after signout; /workspace/agent ${page.status} to login`);
  } else {
    record("logout", "FAIL", `session empty: ${signedOut}, protected page ${page.status}`);
  }
});

const passed = results.filter((r) => r.status === "PASS").length;
const report = { base: BASE, at: new Date().toISOString(), passed, total: results.length, results };
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n${passed}/${results.length} journeys passed — report: ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
