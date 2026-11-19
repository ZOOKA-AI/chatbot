import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0061_mail_ledger_tenant_policies.sql"),
  "utf8"
);
const ROUTE = readFileSync(
  join(process.cwd(), "app/api/admin/migrate/route.ts"),
  "utf8"
);

// The reviewable file and the code copy must describe the same change; the route
// is what production actually runs, so a drift here means production is not
// applying the migration the reviewer approved.
const normalise = (value: string) =>
  value
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const TENANT_TABLES = [
  "MailAddress",
  "MailMessage",
  "MailDraft",
  "MailAttachment",
  "MailAudit",
  "RewardLedger",
];

describe("migration 0061", () => {
  it("is applied by the admin migrate route", () => {
    expect(ROUTE).toContain("mail_ledger_tenant_policies_0061");
  });

  it("names every tenant table that was left without a policy", () => {
    for (const table of TENANT_TABLES) {
      expect(normalise(SQL)).toContain(table);
      expect(normalise(ROUTE)).toContain(table);
    }
  });

  it("grants the runtime role what the mail feature needs", () => {
    const flat = normalise(ROUTE);
    expect(flat).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO zooka_runtime");
    expect(flat).toContain("GRANT DELETE ON TABLE public.%I TO zooka_runtime");
  });

  it("withholds DELETE on the audit table", () => {
    expect(normalise(ROUTE).toUpperCase()).toContain(
      "REVOKE DELETE ON TABLE PUBLIC.%I FROM ZOOKA_RUNTIME"
    );
    expect(normalise(SQL).toLowerCase()).toContain(
      "revoke delete on table public.%i from zooka_runtime"
    );
  });

  it("scopes rows by the tenant column, not by a user column", () => {
    expect(normalise(SQL)).toContain("app.organization_id");
    expect(normalise(ROUTE)).toContain("app.organization_id");
  });
});
