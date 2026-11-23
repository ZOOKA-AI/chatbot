import { describe, expect, test } from "vitest";

import {
  CORE_TABLES,
  isSafeTableName,
  mergeTableList,
  missingCoreTables,
} from "@/lib/admin/backup-tables";

// These cases exist because the export used to hardcode fourteen tables: a
// table added later was never backed up and nothing failed, which is the worst
// possible way to lose data. Each assertion below fails on the old list.
describe("backup table list", () => {
  test("keeps every core table first and in order", () => {
    const list = mergeTableList([...CORE_TABLES]);
    expect(list.slice(0, CORE_TABLES.length)).toEqual([...CORE_TABLES]);
  });

  test("includes tables the core list does not know about", () => {
    const discovered = [
      ...CORE_TABLES,
      "PlatformRole",
      "TikTokPublishJob",
      "TikTokConnection",
      "AgentTask",
      "WebhookEvent",
      "MediaJob",
      "BlogPost",
      "AgentMessage",
    ];
    const list = mergeTableList(discovered);
    for (const table of [
      "PlatformRole",
      "TikTokPublishJob",
      "TikTokConnection",
      "AgentTask",
      "WebhookEvent",
      "MediaJob",
      "BlogPost",
      "AgentMessage",
    ]) {
      expect(list).toContain(table);
    }
    expect(list).toHaveLength(CORE_TABLES.length + 8);
  });

  test("never lists a table twice", () => {
    const list = mergeTableList([...CORE_TABLES, "User", "User", "TikTokPublishJob", "TikTokPublishJob"]);
    expect(list.filter((name) => name === "User")).toHaveLength(1);
    expect(list.filter((name) => name === "TikTokPublishJob")).toHaveLength(1);
  });

  test("drops names that are not bare identifiers", () => {
    const hostile = [
      'User"; DROP TABLE "Organization',
      "User;--",
      "has space",
      "quote'name",
      "semi;colon",
      "",
      42,
      null,
      undefined,
      { name: "User" },
    ];
    const list = mergeTableList(hostile);
    expect(list).toEqual([...CORE_TABLES]);
    for (const bad of hostile) {
      expect(isSafeTableName(bad)).toBe(false);
    }
  });

  test("accepts real table names including underscores and digits", () => {
    expect(isSafeTableName("Message_v2")).toBe(true);
    expect(isSafeTableName("platform_roles")).toBe(true);
    expect(isSafeTableName("_drizzle_migrations")).toBe(true);
    expect(isSafeTableName("t2")).toBe(true);
  });

  test("reports a core table the database did not return", () => {
    const discovered = CORE_TABLES.filter((name) => name !== "Document");
    expect(missingCoreTables(discovered)).toEqual(["Document"]);
    expect(missingCoreTables([...CORE_TABLES])).toEqual([]);
  });

  test("an empty discovery still yields the core list", () => {
    expect(mergeTableList([])).toEqual([...CORE_TABLES]);
  });
});
