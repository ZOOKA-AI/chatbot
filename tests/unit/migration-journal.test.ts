import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const folder = fileURLToPath(new URL("../../lib/db/migrations", import.meta.url));
const journal = JSON.parse(
  readFileSync(`${folder}/meta/_journal.json`, "utf8")
) as {
  entries: { idx: number; when: number; tag: string; version: string; breakpoints: boolean }[];
};
const files = readdirSync(folder)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.slice(0, -4))
  .sort();

test("every journal tag has a matching .sql file", () => {
  const missing = journal.entries
    .map((entry) => entry.tag)
    .filter((tag) => !files.includes(tag));
  assert.deepEqual(missing, [], `journal tags without a .sql file: ${missing.join(", ")}`);
});

test("every .sql file has a journal entry", () => {
  const tags = journal.entries.map((entry) => entry.tag);
  const orphans = files.filter((file) => !tags.includes(file));
  assert.deepEqual(orphans, [], `.sql files missing from the journal: ${orphans.join(", ")}`);
});

test("tags are unique and when values strictly increase", () => {
  const tags = journal.entries.map((entry) => entry.tag);
  const seen = new Set<string>();
  for (const tag of tags) {
    assert.ok(!seen.has(tag), `duplicate journal tag: ${tag}`);
    seen.add(tag);
  }
  for (let index = 1; index < journal.entries.length; index += 1) {
    const previous = journal.entries[index - 1];
    const current = journal.entries[index];
    assert.ok(
      current.when > previous.when,
      `when must increase: ${previous.tag}(${previous.when}) -> ${current.tag}(${current.when})`
    );
  }
});

test("idx values are contiguous from zero", () => {
  const indexes = journal.entries.map((entry) => entry.idx);
  const expected = journal.entries.map((_, index) => index);
  assert.deepEqual(indexes, expected, `idx sequence is broken: ${indexes.join(",")}`);
});
