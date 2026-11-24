import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GrowthSettings, RewardLedger and GrowthAudit are platform-wide. Production
 * showed a freshly registered account (owner of an empty workspace) the editable
 * referral economy and every workspace's recent rewards, because the page and
 * its action only asked for the workspace owner role. Both now require the
 * platform admin grant before reading or writing anything.
 */
const page = readFileSync("app/(chat)/workspace/admin/growth/page.tsx", "utf8");
const action = readFileSync("app/(chat)/workspace/admin/growth/actions.ts", "utf8");

describe("growth admin is platform-only", () => {
  it("page redirects non platform admins before reading global data", () => {
    const gate = page.indexOf('requirePlatformRole("admin"');
    const deny = page.indexOf('if (!platformAdmin) redirect(');
    expect(gate).toBeGreaterThan(-1);
    expect(deny).toBeGreaterThan(gate);
    expect(page.indexOf("readSettings()")).toBeGreaterThan(deny);
    expect(page.indexOf('FROM "RewardLedger"')).toBeGreaterThan(deny);
  });

  it("settings write requires the platform admin grant", () => {
    const gate = action.indexOf('requirePlatformRole("admin"');
    expect(gate).toBeGreaterThan(-1);
    expect(action.indexOf('UPDATE "GrowthSettings"')).toBeGreaterThan(gate);
  });
});
