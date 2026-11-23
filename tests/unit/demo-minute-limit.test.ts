import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db/tenant", () => ({ tenantScopeEnabled: () => true }));
vi.mock("@/lib/db/service-client", () => ({
  serviceConnectionAvailable: () => true,
  serviceDb: () => ({ execute: state.execute }),
}));

import { tryClaimDemoMinute } from "@/lib/db/queries";

const pg = new PGlite();
beforeAll(async () => {
  await pg.exec('CREATE TABLE "GuestUsage" ("key" varchar(128) PRIMARY KEY, "count" integer NOT NULL, "updatedAt" timestamp NOT NULL)');
  const db = drizzle(pg);
  state.execute.mockImplementation(async (query) => (await db.execute(query)).rows);
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
