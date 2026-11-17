import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The application connects as the least-privilege role `zooka_runtime`, which
 * holds no CREATE privilege on schema public. A CREATE TABLE executed from a
 * request handler therefore fails with SQLSTATE 42501, and because it runs
 * inside the request transaction the entire transaction aborts: that is how a
 * chat message was lost while the assistant tried to create `agent_memory`.
 *
 * Schema belongs to versioned migrations. This guard makes the rule mechanical:
 * no module under lib/ or app/ may issue DDL.
 */

const ROOT = process.cwd();

const MODULES = [
  "lib/db/agent-memory.ts",
  "lib/db/creative-credits.ts",
  "lib/db/mcp-keys.ts",
  "lib/db/publish-queue.ts",
  "lib/db/token-wallets.ts",
  "lib/db/wallet-charge.ts",
  "lib/auth/phone-otp.ts",
];

const DDL =
  /\b(CREATE\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+SCHEMA|CREATE\s+ROLE)\b/i;

describe("runtime modules never create schema", () => {
  for (const module of MODULES) {
    it(`${module} issues no DDL`, () => {
      const source = readFileSync(join(ROOT, module), "utf8");
      const match = source.match(DDL);
      expect(match?.[0] ?? null).toBeNull();
    });
  }

  it("the tables those modules use come from a versioned migration", () => {
    const migration = readFileSync(
      join(ROOT, "lib/db/migrations/pending/0056_runtime_own_tables.sql"),
      "utf8"
    );
    for (const table of [
      "agent_memory",
      "creative_credits",
      "creative_usage",
      "mcp_api_key",
      "publish_post",
      "token_wallets",
      "token_grants",
      '"PhoneOtp"',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("migration 0056 enables RLS on every table it creates", () => {
    const migration = readFileSync(
      join(ROOT, "lib/db/migrations/pending/0056_runtime_own_tables.sql"),
      "utf8"
    );
    const created = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS "?([A-Za-z_]+)"?/g)].map(
      (m) => m[1]
    );
    expect(created.length).toBe(8);
    for (const table of created) {
      const enabled =
        migration.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`) ||
        migration.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(enabled, table).toBe(true);
    }
  });

  it("the pre-authentication OTP table stays out of the runtime role", () => {
    const migration = readFileSync(
      join(ROOT, "lib/db/migrations/pending/0056_runtime_own_tables.sql"),
      "utf8"
    );
    const grantBlock = migration.slice(migration.indexOf("GRANT SELECT"));
    expect(grantBlock).not.toContain('"PhoneOtp"');
  });
});
