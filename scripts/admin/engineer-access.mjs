#!/usr/bin/env node
// Issues and revokes an engineer's access from code, so nothing is granted by hand.
//
//   node scripts/admin/engineer-access.mjs status
//   node scripts/admin/engineer-access.mjs grant-readonly-db --role engineer_ro
//   node scripts/admin/engineer-access.mjs revoke-readonly-db --role engineer_ro
//   node scripts/admin/engineer-access.mjs grant-vercel-token --name engineer-zooka-ai --days 30
//   node scripts/admin/engineer-access.mjs grant-github-deploy-key --title engineer --key-file ~/.ssh/engineer.pub [--read-write]
//   node scripts/admin/engineer-access.mjs revoke-github-deploy-key --title engineer
//
// Every value that is a secret is read from the environment and never printed:
//   PLATFORM_ROLE_DATABASE_URL  the database to touch (a production ref needs --confirm-production)
//   VERCEL_TOKEN, VERCEL_TEAM_ID
//   GITHUB_TOKEN, GITHUB_REPO
// The platform role itself stays in scripts/admin/platform-role.mjs, which is the
// only writer of PlatformRole; this script never grants a platform role.
//
// A generated password is printed once, to stdout, because the operator has to
// hand it to the engineer. Nothing else is printed.

import { createRequire } from "node:module";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(`${process.cwd()}/package.json`);
const postgres = require("postgres");

const PRODUCTION_REFS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];
const ROLE_NAME = /^[a-z][a-z0-9_]{2,30}$/;
const SAFE_PASSWORD = /^[A-Za-z0-9]{24,64}$/;
const RESERVED = new Set(["postgres", "anon", "authenticated", "service_role", "supabase_admin"]);
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(2);
}
function generatePassword() {
  let out = "";
  for (let i = 0; i < 32; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
function checkRole(role) {
  if (!ROLE_NAME.test(role ?? "") || role.startsWith("pg_") || RESERVED.has(role)) {
    fail("--role must be a lowercase name such as engineer_ro");
  }
}
function checkProduction(url) {
  if (PRODUCTION_REFS.some((ref) => url.includes(ref)) && !process.argv.includes("--confirm-production")) {
    fail("this is a production database; pass --confirm-production only with the owner's approval");
  }
}
function readOnlyStatements(role, password, exists) {
  if (!SAFE_PASSWORD.test(password)) fail("password must be 24-64 letters or digits");
  return [
    exists
      ? `alter role ${role} with login password '${password}'`
      : `create role ${role} with login password '${password}' nosuperuser nocreatedb nocreaterole bypassrls`,
    `grant connect on database postgres to ${role}`,
    `grant usage on schema public to ${role}`,
    `grant select on all tables in schema public to ${role}`,
    `grant select on all sequences in schema public to ${role}`,
    `alter default privileges in schema public grant select on tables to ${role}`,
    `revoke create on schema public from ${role}`,
    `revoke insert, update, delete, truncate on all tables in schema public from ${role}`,
  ];
}

async function withDb(fn) {
  const url = process.env.PLATFORM_ROLE_DATABASE_URL;
  if (!url) fail("PLATFORM_ROLE_DATABASE_URL is not set");
  checkProduction(url);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const command = process.argv[2];

if (command === "status") {
  await withDb(async (sql) => {
    const roles = await sql`
      select r.rolname, r.rolbypassrls, r.rolsuper,
        has_table_privilege(r.rolname, 'public."User"', 'SELECT') as can_select,
        has_table_privilege(r.rolname, 'public."User"', 'UPDATE') as can_update
      from pg_roles r
      where r.rolname not like 'pg\\_%' and not r.rolsuper
      order by r.rolname`;
    console.table(roles);
  });
} else if (command === "grant-readonly-db" || command === "revoke-readonly-db") {
  const role = arg("role") ?? "engineer_ro";
  checkRole(role);
  await withDb(async (sql) => {
    if (command === "revoke-readonly-db") {
      for (const statement of [
        `revoke all on all tables in schema public from ${role}`,
        `revoke all on all sequences in schema public from ${role}`,
        `revoke usage on schema public from ${role}`,
        `revoke connect on database postgres from ${role}`,
        `drop role if exists ${role}`,
      ]) {
        await sql.unsafe(statement);
      }
      console.log(`revoked ${role}`);
      return;
    }
    const [existing] = await sql`select 1 from pg_roles where rolname = ${role}`;
    const password = arg("password") ?? generatePassword();
    for (const statement of readOnlyStatements(role, password, Boolean(existing))) {
      await sql.unsafe(statement);
    }
    const [proof] = await sql`
      select has_table_privilege(${role}, 'public."User"', 'SELECT') as can_select,
             has_table_privilege(${role}, 'public."User"', 'UPDATE') as can_update`;
    if (!proof?.can_select || proof.can_update) fail("privileges did not land as read-only");
    console.log(`granted ${role} read-only`);
    console.log(`password: ${password}`);
  });
} else if (command === "grant-vercel-token") {
  const token = process.env.VERCEL_TOKEN;
  if (!token) fail("VERCEL_TOKEN is not set");
  const name = arg("name") ?? "engineer-zooka-ai";
  const days = Number(arg("days") ?? 30);
  if (!Number.isFinite(days) || days < 1 || days > 365) fail("--days must be 1-365");
  const response = await fetch("https://api.vercel.com/v3/user/tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, expiresAt: Date.now() + days * 86_400_000 }),
  });
  const body = await response.json();
  if (!response.ok) fail(`vercel rejected the token: ${body?.error?.message ?? response.status}`);
  console.log(`created vercel token ${name}, expires in ${days} days`);
  console.log(`token: ${body.bearerToken ?? body.token}`);
} else if (command === "grant-github-deploy-key" || command === "revoke-github-deploy-key") {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token) fail("GITHUB_TOKEN is not set");
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail("GITHUB_REPO must look like owner/repo");
  const api = (path, init = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "zooka-engineer-access",
        ...(init.headers ?? {}),
      },
    });
  const title = arg("title") ?? "engineer";
  if (command === "revoke-github-deploy-key") {
    const list = await api("/keys?per_page=100");
    const keys = await list.json();
    if (!Array.isArray(keys)) fail("could not list deploy keys");
    const matches = keys.filter((k) => k.title === title);
    if (matches.length === 0) fail(`no deploy key titled ${title}`);
    for (const key of matches) await api(`/keys/${key.id}`, { method: "DELETE" });
    console.log(`revoked ${matches.length} deploy key(s) titled ${title}`);
  } else {
    const keyFile = arg("key-file") ?? join(homedir(), ".ssh", `${title}.pub`);
    const publicKey = readFileSync(keyFile.replace(/^~/, homedir()), "utf8").trim();
    if (!/^ssh-(ed25519|rsa) AAAA[0-9A-Za-z+/]+=*(\s+\S*)?$/.test(publicKey)) fail("key file is not one public key line");
    const response = await api("/keys", {
      method: "POST",
      body: JSON.stringify({ title, key: publicKey, read_only: !process.argv.includes("--read-write") }),
    });
    const body = await response.json();
    if (!response.ok) fail(`github rejected the key: ${body?.message ?? response.status}`);
    console.log(`added deploy key ${title} id=${body.id} read_only=${body.read_only}`);
  }
} else {
  fail("usage: status | grant-readonly-db | revoke-readonly-db | grant-vercel-token | grant-github-deploy-key | revoke-github-deploy-key");
}
