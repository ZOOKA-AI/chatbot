/** Never log database messages, SQL parameters, URLs, or user identifiers. */
export function databaseFailureCode(error: unknown): string {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    const code = record.code;
    if (
      typeof code === "string" &&
      /^(?:[0-9A-Z]{5}|E[A-Z_]{2,30}|CONNECT_TIMEOUT)$/.test(code)
    ) {
      return code;
    }
    current = record.cause;
  }
  return "UNKNOWN";
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Account database is unavailable");
    this.name = "DatabaseUnavailableError";
  }
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    if (current instanceof DatabaseUnavailableError) {
      return true;
    }
    seen.add(current);
    const record = current as Record<string, unknown>;
    current =
      record.cause && typeof record.cause === "object" && "err" in record.cause
        ? (record.cause as { err: unknown }).err
        : record.cause;
  }
  return false;
}

export function accountDatabaseError(
  operation: "lookup" | "create",
  error: unknown
) {
  console.error("account_database_unavailable", {
    operation,
    code: databaseFailureCode(error),
  });
  return new DatabaseUnavailableError();
}
