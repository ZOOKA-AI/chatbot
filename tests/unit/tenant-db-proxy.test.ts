import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// lib/db/* are server-only; the guard module is stubbed so this test can import them.
vi.mock("server-only", () => ({}));

import { db } from "@/lib/db/queries";
import { runInTenantTransaction } from "@/lib/db/tenant-client";

/**
 * Proves the shared `db` handle resolves to the request's tenant transaction.
 *
 * If the proxy were bypassed, every query here would run on the owner connection
 * and the counts would be identical for both organisations. The test therefore
 * fails loudly on the exact regression it exists to catch.
 */
const ready =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.DATABASE_URL_TENANT) &&
  process.env.TENANT_RLS_ENABLED === "on";

async function chatCount(): Promise<number> {
  const rows = (await db.execute(sql`select count(*)::int as n from "Chat"`)) as unknown as {
    n: number;
  }[];
  return rows[0]?.n ?? -1;
}

describe.skipIf(!ready)("db handle follows the tenant transaction", () => {
  it("sees one tenant at a time through the shared handle", async () => {
    // Outside a transaction the handle is the owner connection, so it can see
    // every organisation and enumerate them for the assertions below.
    const orgs = (await db.execute(
      sql`select distinct "organizationId"::text as id from "Chat" limit 2`
    )) as unknown as { id: string }[];
    expect(orgs.length).toBeGreaterThanOrEqual(2);

    const total = await chatCount();
    expect(total).toBeGreaterThanOrEqual(2);

    const perOrg: number[] = [];
    for (const org of orgs) {
      perOrg.push(
        await runInTenantTransaction({ organizationId: org.id, userId: null }, chatCount)
      );
    }

    // Each tenant sees exactly its own row, never the union.
    expect(perOrg).toEqual([1, 1]);
    // If the proxy were bypassed each transaction would see every row, so the
    // per-tenant numbers would exceed the total instead of accounting for it.
    expect(perOrg.reduce((a, b) => a + b, 0)).toBe(total);
  }, 30_000);

  it("cannot reach another tenant by id even when asked directly", async () => {
    const orgs = (await db.execute(
      sql`select distinct "organizationId"::text as id from "Chat" limit 2`
    )) as unknown as { id: string }[];
    const [first, second] = orgs.map((o) => o.id);

    const leaked = await runInTenantTransaction(
      { organizationId: first, userId: null },
      async () =>
        (await db.execute(
          sql`select count(*)::int as n from "Chat" where "organizationId" = ${second}`
        )) as unknown as { n: number }[]
    );

    expect(leaked[0]?.n).toBe(0);
  }, 30_000);
});
