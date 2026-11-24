import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ execute: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/db/tenant", () => ({ tenantScopeEnabled: () => true }));
vi.mock("@/lib/db/service-client", () => ({
  serviceConnectionAvailable: () => true,
  serviceDb: () => ({ execute: state.execute, delete: state.delete }),
}));

import { pruneDemoMinuteLimits, tryClaimDemoMinute } from "@/lib/db/queries";
import { checkDemoMinuteLimit } from "@/lib/guest-quota";

const pg = new PGlite();
beforeAll(async () => {
  await pg.exec('CREATE TABLE "GuestUsage" ("key" varchar(128) PRIMARY KEY, "count" integer NOT NULL, "updatedAt" timestamp NOT NULL)');
  const db = drizzle(pg);
  state.execute.mockImplementation(async (query) => (await db.execute(query)).rows);
  state.delete.mockImplementation((table) => db.delete(table));
});

test("missing IPs share a fallback budget even when guest cookies change", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  try {
    for (let i = 0; i < 4; i++) {
      expect(await checkDemoMinuteLimit(`guest:${i}:today`)).toBe(true);
    }
    expect(await checkDemoMinuteLimit("guest:new:today")).toBe(false);
  } finally {
    vi.restoreAllMocks();
  }
});

test("pruning removes stale minute rows without touching active or daily rows", async () => {
  await pg.exec(`
    INSERT INTO "GuestUsage" VALUES
      ('demo-minute:stale', 1, now() - interval '3 days'),
      ('demo-minute:active', 1, now()),
      ('guest:daily', 1, now() - interval '3 days')
  `);
  await pruneDemoMinuteLimits();
  const rows = await pg.query<{ key: string }>('SELECT "key" FROM "GuestUsage"');
  const keys = rows.rows.map((row) => row.key);
  expect(keys).not.toContain("demo-minute:stale");
  expect(keys).toContain("demo-minute:active");
  expect(keys).toContain("guest:daily");
});
afterAll(async () => pg.close());

test("minute claims are atomic, isolated by visitor, and reset after the window", async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, () => tryClaimDemoMinute("demo-minute:guest:one", 2))
  );
  expect(results.filter(Boolean)).toHaveLength(2);
  expect(await tryClaimDemoMinute("demo-minute:guest:two", 2)).toBe(true);
  await pg.exec(`UPDATE "GuestUsage" SET "updatedAt" = now() - interval '61 seconds' WHERE "key" = 'demo-minute:guest:one'`);
  expect(await tryClaimDemoMinute("demo-minute:guest:one", 2)).toBe(true);
  expect(await tryClaimDemoMinute("demo-minute:guest:one", 2)).toBe(true);
  expect(await tryClaimDemoMinute("demo-minute:guest:one", 2)).toBe(false);
});
