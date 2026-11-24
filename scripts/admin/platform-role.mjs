#!/usr/bin/env node
// Grants, revokes or lists platform roles. The only way a PlatformRole row is written.
//
//   node scripts/admin/platform-role.mjs list
//   node scripts/admin/platform-role.mjs grant  --user-id <uuid> --role super_admin|admin --by "<who approved>" --reason "<why>"
//   node scripts/admin/platform-role.mjs revoke --user-id <uuid> --by "<who approved>" --reason "<why>"
//
// Connection: PLATFORM_ROLE_DATABASE_URL (deliberately not DATABASE_URL, so the
// target is always an explicit choice). A production project additionally needs
// --confirm-production, which should only be passed after the owner approved the
// exact command.
//
// By immutable user id only: an email is printed for the operator to confirm,
// never used to choose who is promoted. Every change is written to
// PlatformAuditLog in the same transaction as the grant.

import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const postgres = require("postgres");

const PRODUCTION_REFS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(2);
}

const command = process.argv[2];
const url = process.env.PLATFORM_ROLE_DATABASE_URL;
if (!url) fail("PLATFORM_ROLE_DATABASE_URL is not set");
if (PRODUCTION_REFS.some((ref) => url.includes(ref)) && !process.argv.includes("--confirm-production")) {
  fail("this is a production database; pass --confirm-production only with the owner's approval");
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  if (command === "list") {
    const rows = await sql`
      select r."userId", u."email", r."role", r."grantedBy", r."reason", r."grantedAt"
      from "PlatformRole" r join "User" u on u."id" = r."userId" order by r."grantedAt"`;
    console.table(rows);
  } else if (command === "grant" || command === "revoke") {
    const userId = arg("user-id");
    const role = arg("role");
    const by = arg("by");
    const reason = arg("reason");
    if (!UUID.test(userId ?? "")) fail("--user-id must be the user's UUID (not an email)");
    if (command === "grant" && role !== "super_admin" && role !== "admin") fail("--role must be super_admin or admin");
    if (!by || by.length < 3) fail("--by is required (who approved this)");
    if (!reason || reason.length < 8) fail("--reason is required");

    const [target] = await sql`select "id", "email" from "User" where "id" = ${userId}`;
    if (!target) fail(`no user with id ${userId}`);

    await sql.begin(async (tx) => {
      const [before] = await tx`select "role" from "PlatformRole" where "userId" = ${userId}`;
      if (command === "grant") {
        await tx`
          insert into "PlatformRole" ("userId", "role", "grantedBy", "reason")
          values (${userId}, ${role}, ${by}, ${reason})
          on conflict ("userId") do update set "role" = excluded."role",
            "grantedBy" = excluded."grantedBy", "reason" = excluded."reason", "grantedAt" = now()`;
      } else {
        await tx`delete from "PlatformRole" where "userId" = ${userId}`;
      }
      await tx`
        insert into "PlatformAuditLog" ("actorUserId", "action", "target", "outcome", "metadata")
        values (null, ${`platform_role.${command}`}, ${userId}, 'allowed',
                ${tx.json({ by, reason, before: before?.role ?? null, after: command === "grant" ? role : null, via: "scripts/admin/platform-role.mjs" })})`;
    });
    console.log(`${command}: ${target.email} (${userId}) ${command === "grant" ? `-> ${role}` : "-> no platform role"}`);
  } else {
    fail("usage: list | grant --user-id --role --by --reason | revoke --user-id --by --reason");
  }
} finally {
  await sql.end({ timeout: 5 });
}
