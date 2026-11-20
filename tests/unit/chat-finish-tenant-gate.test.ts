import { afterEach, expect, test, vi } from "vitest";

import { runAfterResponseInTenant } from "@/lib/db/tenant-client";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

test("flag off: chat finish work runs without a tenant database (production today)", async () => {
  delete process.env.TENANT_RLS_ENABLED;
  delete process.env.DATABASE_URL_TENANT;
  const work = vi.fn(async () => "persisted");
  await expect(
    runAfterResponseInTenant(
      { organizationId: "00000000-0000-4000-8000-000000000001", userId: null },
      work
    )
  ).resolves.toBe("persisted");
  expect(work).toHaveBeenCalledOnce();
});

test("flag on: the tenant path is still enforced, never silently skipped", async () => {
  process.env.TENANT_RLS_ENABLED = "on";
  delete process.env.DATABASE_URL_TENANT;
  const work = vi.fn(async () => "persisted");
  await expect(
    runAfterResponseInTenant(
      { organizationId: "00000000-0000-4000-8000-000000000001", userId: null },
      work
    )
  ).rejects.toThrow("DATABASE_URL_TENANT is not configured");
  expect(work).not.toHaveBeenCalled();
});

test("flag on: a missing organisation is refused before any work", async () => {
  process.env.TENANT_RLS_ENABLED = "on";
  const work = vi.fn(async () => "persisted");
  await expect(runAfterResponseInTenant(null, work)).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
});
