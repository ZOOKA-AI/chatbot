/**
 * Postgres error details, wherever the driver error sits.
 *
 * drizzle-orm 0.45 wraps every driver failure in a DrizzleQueryError whose message is
 * "Failed query: ..." and whose `cause` is the original PostgresError. Code that read
 * `error.code` or matched "duplicate key" on `error.message` silently stopped recognising
 * unique and foreign-key violations. Every caller goes through this instead.
 */
export type PgErrorDetails = {
  code?: string;
  constraint?: string;
  message: string;
};

export function pgError(error: unknown): PgErrorDetails {
  let current: unknown = error;
  let message = "";
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const shaped = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof shaped.message === "string") message = `${message} ${shaped.message}`.trim();
    if (typeof shaped.code === "string" && /^[0-9A-Z]{5}$/.test(shaped.code)) {
      const constraint =
        typeof shaped.constraint_name === "string"
          ? shaped.constraint_name
          : typeof shaped.constraint === "string"
            ? shaped.constraint
            : undefined;
      return { code: shaped.code, constraint, message };
    }
    current = shaped.cause;
  }
  if (!message) message = String(error);
  return { message };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const details = pgError(error);
  const matches =
    details.code === "23505" || /duplicate key value|unique constraint/i.test(details.message);
  if (!matches) return false;
  if (!constraint) return true;
  return details.constraint === constraint || details.message.includes(constraint);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgError(error).code === "23503";
}
