import { expect, test, vi } from "vitest";
import {
  accountDatabaseError,
  databaseFailureCode,
  isDatabaseUnavailable,
} from "@/lib/db/diagnostics";

test("database failures log only an allowlisted operation and code", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const error = accountDatabaseError("lookup", {
      code: "XX000",
      message: "password=secret email=private@example.test",
      query: "SELECT secret",
      cause: {},
    });
    expect(log).toHaveBeenCalledWith("account_database_unavailable", {
      operation: "lookup",
      code: "XX000",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(isDatabaseUnavailable({ cause: { err: error } })).toBe(true);
    expect(isDatabaseUnavailable(new Error("wrong password"))).toBe(false);
  } finally {
    log.mockRestore();
  }
});
test("untrusted database codes cannot leak data and cause cycles terminate", () => {
  expect(databaseFailureCode({ code: "password:secret" })).toBe("UNKNOWN");
  expect(databaseFailureCode({ cause: { code: "CONNECT_TIMEOUT" } })).toBe(
    "CONNECT_TIMEOUT"
  );
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  expect(databaseFailureCode(cycle)).toBe("UNKNOWN");
  expect(isDatabaseUnavailable(cycle)).toBe(false);
});
