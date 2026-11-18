import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { MCP_TOOL_CATALOG } from "@/lib/mcp/catalog";

test("the MCP tools shown in settings are exactly the tools the server registers", () => {
  const source = readFileSync("lib/mcp/server.ts", "utf8");
  const registered = [...source.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  expect(registered.length).toBeGreaterThan(0);
  expect(MCP_TOOL_CATALOG.map((tool) => tool.name).sort()).toEqual([...registered].sort());
});

test("catalog costs follow the server's read/write multipliers", () => {
  const source = readFileSync("lib/mcp/server.ts", "utf8");
  expect(source).toContain("const READ_COST = 1;");
  expect(source).toContain("const WRITE_COST = 5;");
  for (const tool of MCP_TOOL_CATALOG) {
    if (tool.kind === "read") expect(tool.cost).toBe(1);
    if (tool.kind === "free") expect(tool.cost).toBe(0);
  }
  expect(MCP_TOOL_CATALOG.find((t) => t.name === "generate_brand_dna")?.cost).toBe(25);
});
