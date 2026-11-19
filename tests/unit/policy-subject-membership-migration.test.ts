import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0062_policy_subject_membership.sql"),
  "utf8"
);
const ROUTE = readFileSync(
  join(process.cwd(), "app/api/admin/migrate/route.ts"),
  "utf8"
);

const normalise = (value: string) =>
  value
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("migration 0062", () => {
  it("is applied by the admin migrate route", () => {
    expect(ROUTE).toContain("policy_subject_membership_0062");
  });

  it("guards the tenant predicate with a membership check", () => {
    for (const sql of [normalise(SQL), normalise(ROUTE)]) {
      expect(sql).toContain("app_is_org_member");
      expect(sql).toContain("app_tenant_subject");
    }
  });

  it("keeps the legacy path alive when no subject is present", () => {
    // The guard must return true without a subject, or every service path that
    // never sets claims would read zero rows.
    expect(normalise(SQL)).toContain("when public.app_tenant_subject() is null then true");
  });

  it("pins the definer search_path to stop the recursive policy lookup", () => {
    expect(normalise(SQL)).toContain("security definer set search_path = public, pg_temp");
  });

  it("rebuilds every policy with its original command", () => {
    for (const cmd of ["for all", "for select", "for insert", "for update", "for delete"]) {
      expect(normalise(SQL).toLowerCase()).toContain(cmd);
    }
  });
});
