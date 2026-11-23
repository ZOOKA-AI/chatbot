import { describe, expect, it } from "vitest";

import { isForeignKeyViolation, isUniqueViolation, pgError } from "@/lib/db/errors";

// The shape drizzle-orm 0.45 throws: a DrizzleQueryError whose cause is the driver error.
function wrapped(cause: Record<string, unknown>) {
  const driver = Object.assign(new Error(String(cause.message ?? "driver")), cause);
  return Object.assign(new Error("Failed query: insert into \"X\" ..."), { cause: driver });
}

describe("pgError", () => {
  it("finds the SQLSTATE on the cause of a wrapped error", () => {
    const error = wrapped({
      code: "23505",
      constraint_name: "AgentProject_organizationId_name_key",
      message: "duplicate key value violates unique constraint",
    });
    expect(pgError(error)).toMatchObject({
      code: "23505",
      constraint: "AgentProject_organizationId_name_key",
    });
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, "AgentProject_organizationId_name_key")).toBe(true);
    expect(isUniqueViolation(error, "Other_key")).toBe(false);
  });

  it("still reads an unwrapped driver error", () => {
    const error = Object.assign(new Error("insert or update violates foreign key"), {
      code: "23503",
    });
    expect(isForeignKeyViolation(error)).toBe(true);
    expect(isUniqueViolation(error)).toBe(false);
  });

  it("does not mistake an application code for a SQLSTATE", () => {
    expect(pgError(Object.assign(new Error("x"), { code: "rate_limited" })).code).toBeUndefined();
  });
});
