import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAIL_DDL } from "@/lib/mail/ddl";

const SQL = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0060_zooka_mail.sql"),
  "utf8"
);
const DOWN = readFileSync(
  join(process.cwd(), "lib/db/migrations/pending/0060_zooka_mail.down.sql"),
  "utf8"
);

// The SQL carries review comments between columns; the code copy does not.
// Comment lines are dropped from both sides before comparing.
const normalise = (value: string) =>
  value
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const TABLES = ["MailAddress", "MailMessage", "MailDraft", "MailAttachment", "MailAudit"];

describe("migration 0060", () => {
  it("keeps the code copy and the reviewable SQL identical", () => {
    const flat = normalise(SQL);
    for (const statement of MAIL_DDL) {
      expect(flat).toContain(normalise(statement));
    }
  });

  it("creates every table idempotently", () => {
    for (const table of TABLES) {
      expect(normalise(SQL)).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it("enables row level security on every table it creates", () => {
    for (const table of TABLES) {
      expect(normalise(SQL)).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    // No policies on purpose: the runtime role is meant to be refused, not scoped.
    expect(normalise(SQL)).not.toContain("CREATE POLICY");
  });

  it("makes the address unique and lower case in the database itself", () => {
    expect(normalise(SQL)).toContain('CONSTRAINT "MailAddress_localPart_key" UNIQUE ("localPart")');
    expect(normalise(SQL)).toContain('CONSTRAINT "MailAddress_localPart_lower_check" CHECK ("localPart" = lower("localPart"))');
  });

  it("drops everything in the down migration", () => {
    for (const table of TABLES) {
      expect(normalise(DOWN)).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
  });

  it("does not share a number with another pending migration", () => {
    // A number clash is silent until two branches merge, and then one migration
    // is never applied. Checking the directory is cheap; discovering it later is not.
    // A file and its .down.sql twin legitimately share a number, so compare stems.
    const stems = readdirSync(join(process.cwd(), "lib/db/migrations/pending"))
      .filter((name) => name.endsWith(".sql") && !name.endsWith(".down.sql"))
      .map((name) => name.replace(/\.sql$/, ""));
    const seen = new Map<string, number>();
    for (const stem of stems) {
      const number = stem.match(/^(\d{4})_/)?.[1];
      if (number) seen.set(number, (seen.get(number) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([number]) => number);
    expect(duplicates).toEqual([]);
  });

  it("never touches an existing table", () => {
    const flat = normalise(SQL);
    expect(flat).not.toMatch(/ALTER TABLE "(User|Organization|Chat|Message|WebhookEvent)"/);
    expect(flat).not.toContain("DROP TABLE");
  });
});
