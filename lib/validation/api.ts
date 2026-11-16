import { z } from "zod";

/**
 * Request validation for the API handlers, in one place.
 *
 * Rules:
 *  1. Every schema declares its limits: a string has a maximum, a number has a
 *     range, an id has a shape. Unlimited input is a bug even when it is benign.
 *  2. Unexpected fields are rejected, not dropped. Dropping them silently lets a
 *     caller believe a field took effect.
 *  3. This module never writes a response. It reports a short reason, and the
 *     route answers in the shape it already uses, so no client contract changes.
 *
 * It also does not decide authorisation: call it after the caller is resolved.
 */

export const fields = {
  uuid: z.string().uuid(),
  id: z.string().trim().min(1).max(64),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, "lowercase letters, digits, hyphen or underscore"),
  name: z.string().trim().min(1).max(120),
  shortText: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  reason: z.string().trim().min(3).max(4000),
  commitSha: z.string().trim().regex(/^[0-9a-f]{7,40}$/i),
  environment: z.enum(["production", "preview", "development"]).optional(),
  limit: z.coerce.number().int().min(1).max(200),
  offset: z.coerce.number().int().min(0).max(1_000_000),
  priority: z.enum(["low", "normal", "high", "critical"]),
  taskStatus: z.enum(["in_progress", "completed", "failed", "blocked"]),
  list: z.array(z.string().trim().min(1).max(64)).max(50),
} as const;

export type Validated<T> = { ok: true; data: T } | { ok: false; reason: string; detail: string };

function fail<T>(reason: string, detail: string): Validated<T> {
  return { ok: false, reason, detail };
}

/** Field names and the failing rule. Never the submitted value. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.code}`)
    .join(", ");
}

export function validate<T extends z.ZodTypeAny>(schema: T, raw: unknown): Validated<z.infer<T>> {
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : fail("invalid_body", describeIssues(parsed.error));
}

/** Parses a JSON body. Malformed JSON and schema failures are distinct reasons. */
export async function validateJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<Validated<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("invalid_json", "body is not valid JSON");
  }
  return validate(schema, raw);
}

/**
 * Parses query parameters as strings, then coerces through the schema. A key
 * repeated in the URL is refused rather than guessed at.
 */
export function validateQuery<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Validated<z.infer<T>> {
  const params = new URL(request.url).searchParams;
  const bag: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    if (all.length > 1) {
      return fail("invalid_query", `${key}: repeated`);
    }
    bag[key] = all[0];
  }
  const parsed = schema.safeParse(bag);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : fail("invalid_query", describeIssues(parsed.error));
}

/** Validates one route path segment. */
export function validateParam<T extends z.ZodTypeAny>(
  value: string | undefined,
  schema: T,
  what: string
): Validated<z.infer<T>> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : fail("invalid_path", `${what}: invalid`);
}
