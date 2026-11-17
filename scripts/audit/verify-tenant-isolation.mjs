#!/usr/bin/env node
/**
 * Cross-tenant isolation proof for the production policy set, run on an
 * isolated in-process engine (PGlite) instead of production.
 *
 * The tables, policies and the app_is_member() helper are copied from the
 * production catalog (pg_policies / pg_get_functiondef on 2026-11-18), so the
 * behaviour measured here is the behaviour the policies actually have. Nothing
 * connects to production and nothing is written outside the process.
 *
 * Usage: node scripts/audit/verify-tenant-isolation.mjs
 */
import { PGlite } from "@electric-sql/pglite";

const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const USER_A = "11111111-0000-4000-8000-00000000000a";
const USER_B = "22222222-0000-4000-8000-00000000000b";

const SCHEMA = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE ROLE zooka_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT zooka_runtime TO current_user;

CREATE TABLE "Organization" (id uuid primary key);
CREATE TABLE "OrganizationMember" (
  "organizationId" uuid not null,
  "userId" uuid not null,
  role text not null,
  primary key ("organizationId","userId")
);

CREATE OR REPLACE FUNCTION public.app_is_member(ws uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1 from "OrganizationMember" m
    where m."organizationId" = ws and m."userId" = auth.uid()
  );
$$;

CREATE TABLE "Chat" (
  id uuid primary key,
  title text,
  "userId" uuid,
  "organizationId" uuid
);
CREATE TABLE "Message_v2" (
  id uuid primary key,
  "chatId" uuid,
  role text
);
CREATE TABLE token_wallets (
  organization_id text primary key,
  plan text,
  weighted_remaining int
);
CREATE TABLE mcp_api_key (
  id uuid primary key default gen_random_uuid(),
  organization_id text,
  name text
);
CREATE TABLE integration_connection (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  provider text,
  encrypted_tokens text
);

INSERT INTO "Organization" VALUES ('${ORG_A}'), ('${ORG_B}');
INSERT INTO "OrganizationMember" VALUES ('${ORG_A}','${USER_A}','owner'), ('${ORG_B}','${USER_B}','owner');
INSERT INTO "Chat" VALUES
  ('cccccccc-0000-4000-8000-000000000001','a-1','${USER_A}','${ORG_A}'),
  ('cccccccc-0000-4000-8000-000000000002','a-2','${USER_A}','${ORG_A}'),
  ('cccccccc-0000-4000-8000-000000000003','b-1','${USER_B}','${ORG_B}');
INSERT INTO "Message_v2" VALUES
  (gen_random_uuid(),'cccccccc-0000-4000-8000-000000000001','user'),
  (gen_random_uuid(),'cccccccc-0000-4000-8000-000000000002','user'),
  (gen_random_uuid(),'cccccccc-0000-4000-8000-000000000003','user');
INSERT INTO token_wallets VALUES ('${ORG_A}','pro',500), ('${ORG_B}','pro',900);
INSERT INTO mcp_api_key (organization_id,name) VALUES ('${ORG_A}','A key'), ('${ORG_B}','B key');
INSERT INTO integration_connection (workspace_id,provider,encrypted_tokens) VALUES
  ('${ORG_A}','github','A secret'), ('${ORG_B}','github','B secret');

-- policies, verbatim from pg_policies on production
ALTER TABLE "Chat" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Chat" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));
CREATE POLICY Chat_member_read ON "Chat" FOR SELECT USING (app_is_member("organizationId"));

ALTER TABLE "Message_v2" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_via_chat ON "Message_v2" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message_v2"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message_v2"."chatId"
    AND (c."organizationId")::text = current_setting('app.organization_id', true)));
CREATE POLICY Message_v2_member_read ON "Message_v2" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "Chat" c WHERE c.id = "Message_v2"."chatId" AND app_is_member(c."organizationId")));

ALTER TABLE token_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON token_wallets FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

ALTER TABLE mcp_api_key ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mcp_api_key FOR ALL
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

ALTER TABLE integration_connection ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_connection FOR SELECT
  USING ((workspace_id)::text = current_setting('app.organization_id', true));
CREATE POLICY integration_connection_member_write ON integration_connection FOR ALL
  USING (app_is_member(workspace_id)) WITH CHECK (app_is_member(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zooka_runtime;
`;

const results = [];
const record = (name, ok, detail = "") => results.push({ name, ok, detail });

const db = new PGlite();
try {
  await db.exec(SCHEMA);
} catch (error) {
  console.error("fixture failed:", error.message);
  process.exit(1);
}

async function asRuntime(fn, { org, user, jwt } = {}) {
  await db.exec("BEGIN");
  try {
    await db.exec("SET LOCAL ROLE zooka_runtime");
    if (org) await db.query("select set_config('app.organization_id',$1,true)", [org]);
    if (user) await db.query("select set_config('app.user_id',$1,true)", [user]);
    if (jwt) await db.query("select set_config('request.jwt.claim.sub',$1,true)", [jwt]);
    const out = await fn();
    await db.exec("ROLLBACK");
    return out;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

const count = async (table) =>
  Number((await db.query(`select count(*)::int n from ${table}`)).rows[0].n);

// 1. no tenant context: nothing is visible
const bare = await asRuntime(() => count('"Chat"'));
record("no context sees no chats", bare === 0, `rows=${bare}`);

// 2. org context sees only that org
const aChats = await asRuntime(() => count('"Chat"'), { org: ORG_A });
const bChats = await asRuntime(() => count('"Chat"'), { org: ORG_B });
record("org A sees only its 2 chats", aChats === 2, `rows=${aChats}`);
record("org B sees only its 1 chat", bChats === 1, `rows=${bChats}`);

// 3. cross-tenant read by id returns nothing
const foreign = await asRuntime(
  () => db.query(`select id from "Chat" where id = 'cccccccc-0000-4000-8000-000000000003'`).then((r) => r.rows.length),
  { org: ORG_A }
);
record("org A cannot read org B chat by id", foreign === 0, `rows=${foreign}`);

// 4. cross-tenant update and delete touch zero rows
const upd = await asRuntime(
  () => db.query(`update "Chat" set title = 'hijack' where id = 'cccccccc-0000-4000-8000-000000000003' returning id`).then((r) => r.rows.length),
  { org: ORG_A }
);
const del = await asRuntime(
  () => db.query(`delete from "Chat" where id = 'cccccccc-0000-4000-8000-000000000003' returning id`).then((r) => r.rows.length),
  { org: ORG_A }
);
record("org A cannot update org B chat", upd === 0, `rows=${upd}`);
record("org A cannot delete org B chat", del === 0, `rows=${del}`);

// 5. cross-tenant insert is refused by WITH CHECK
let insertRefused = false;
let insertCode = "";
try {
  await asRuntime(
    () => db.query(`insert into token_wallets (organization_id,plan,weighted_remaining) values ($1,'pro',1)`, [ORG_B]),
    { org: ORG_A }
  );
} catch (error) {
  insertRefused = true;
  insertCode = error.code ?? "rls";
}
record("org A cannot insert a wallet for org B", insertRefused, insertCode);

// 6. messages inherit isolation through the chat join
const msgs = await asRuntime(() => count('"Message_v2"'), { org: ORG_A });
record("messages follow the chat's tenant", msgs === 2, `rows=${msgs}`);

// 7. wallets and keys are separated per organization
const wallets = await asRuntime(
  () => db.query(`select weighted_remaining w from token_wallets`).then((r) => r.rows.map((x) => x.w)),
  { org: ORG_A }
);
record("org A reads its own wallet only", wallets.length === 1 && Number(wallets[0]) === 500, JSON.stringify(wallets));

const secrets = await asRuntime(
  () => db.query(`select encrypted_tokens t from integration_connection`).then((r) => r.rows.map((x) => x.t)),
  { org: ORG_A }
);
record("org A cannot see org B integration tokens", secrets.length === 1 && secrets[0] === "A secret", JSON.stringify(secrets));

// 8. app_is_member() depends on the JWT claim, not on app.user_id
const memberWithoutJwt = await asRuntime(
  () => db.query(`select app_is_member($1) m`, [ORG_A]).then((r) => r.rows[0].m),
  { org: ORG_A, user: USER_A }
);
const memberWithJwt = await asRuntime(
  () => db.query(`select app_is_member($1) m`, [ORG_A]).then((r) => r.rows[0].m),
  { org: ORG_A, user: USER_A, jwt: USER_A }
);
record("app_is_member is false with app.user_id alone", memberWithoutJwt === false, String(memberWithoutJwt));
record("app_is_member is true once the JWT claim is set", memberWithJwt === true, String(memberWithJwt));

// 9. the runtime role cannot escalate
let ddlRefused = false;
let disableRefused = false;
try {
  await asRuntime(() => db.exec("create table probe_escalation (id int)"));
} catch {
  ddlRefused = true;
}
try {
  await asRuntime(() => db.exec('alter table "Chat" disable row level security'));
} catch {
  disableRefused = true;
}
record("runtime cannot create a table", ddlRefused);
record("runtime cannot disable RLS", disableRefused);

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await db.close();
process.exit(failed.length === 0 ? 0 : 1);
