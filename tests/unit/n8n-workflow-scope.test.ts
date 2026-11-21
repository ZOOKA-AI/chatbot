import { describe, expect, test } from "vitest";

import { isInScope, readWorkflowScope } from "../../lib/integrations/n8n/scope";

describe("n8n workflow scope", () => {
  test("an unset scope shows every workflow, which is right for a single-purpose instance", () => {
    expect(readWorkflowScope(undefined)).toBeNull();
    expect(readWorkflowScope("")).toBeNull();
    expect(readWorkflowScope("  ,  ")).toBeNull();
    expect(isInScope("anything", null)).toBe(true);
  });

  test("a configured scope keeps only the listed workflows", () => {
    const scope = readWorkflowScope("aaa, bbb ,ccc");
    expect(scope).not.toBeNull();
    expect(scope?.size).toBe(3);
    expect(isInScope("bbb", scope ?? new Set())).toBe(true);
    expect(isInScope("zzz", scope ?? new Set())).toBe(false);
  });
});
