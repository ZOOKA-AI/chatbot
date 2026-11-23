import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

/**
 * The backup used to copy a hand-written list of 14 legacy tables, so every table
 * added since (platform roles, TikTok, agent tasks, webhooks, media, blog...) was
 * silently left out of the disaster-recovery dump. The list now comes from the
 * database catalog, so a new table is covered the moment its migration lands.
 */
const { state } = vi.hoisted(() => ({
  state: { catalog: [] as string[], selected: [] as string[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({
  default: () => ({
    unsafe: async (query: string) => {
      if (/pg_tables/i.test(query)) {
        return state.catalog.map((tablename) => ({ tablename }));
      }
      const match = /FROM "([^"]+)"/.exec(query);
      if (match) state.selected.push(match[1]);
      return [{ id: `${match?.[1]}-1` }];
    },
    end: async () => {},
  }),
}));

import { GET } from "@/app/api/admin/backup/route";

const TOKEN = "coverage-test-token";
const NEW_TABLES = [
  "PlatformRole",
  "PlatformAuditLog",
  "TikTokConnection",
  "TikTokPublishJob",
  "AgentTask",
  "WebhookEvent",
  "MediaJob",
  "BlogPost",
  "AgentMessage",
];

beforeEach(() => {
  state.catalog = ["User", "Organization", "Chat", ...NEW_TABLES];
  state.selected = [];
  process.env.BACKUP_TOKEN = TOKEN;
  process.env.DATABASE_URL = "postgres://u:p@db.internal:5432/app";
});

afterEach(() => {
  delete process.env.BACKUP_TOKEN;
  delete process.env.DATABASE_URL;
});

function call() {
  return GET(
    new Request("https://zooka-ai.com/api/admin/backup", {
      headers: { "x-backup-token": TOKEN },
    })
  );
}

test("every table in the public schema is exported, not just the legacy list", async () => {
  const res = await call();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { tables: Record<string, unknown[]> };
  for (const table of NEW_TABLES) {
    assert.ok(state.selected.includes(table), `${table} was not read`);
    assert.ok(Array.isArray(body.tables[table]), `${table} missing from the dump`);
  }
});

test("a catalog name that is not a plain identifier is never interpolated", async () => {
  state.catalog = ["User", 'Evil"; DROP TABLE "User'];
  const res = await call();
  assert.equal(res.status, 200);
  assert.ok(!state.selected.some((t) => t.includes("DROP")));
});
