import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { test, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  db: { execute: (query: unknown) => execute(query) },
}));

import {
  listAgentMemories,
  saveAgentMemory,
} from "@/lib/db/agent-memory";

test("agent memory can be saved and retrieved from the workspace", async () => {
  const client = new PGlite();
  const database = drizzle(client);
  execute.mockImplementation(async (query) => {
    const result = await database.execute(query);
    return result.rows;
  });

  try {
    await saveAgentMemory({
      userId: "user-1",
      organizationId: "workspace-1",
      key: "reply_style",
      value: "Use concise replies",
    });

    assert.deepEqual(
      await listAgentMemories({ organizationId: "workspace-1" }),
      [{ key: "reply_style", value: "Use concise replies", importance: 7 }]
    );
    assert.deepEqual(
      await listAgentMemories({ organizationId: "other-workspace" }),
      []
    );
  } finally {
    await client.close();
  }
});
