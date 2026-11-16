import { z } from "zod";

import { ChatbotError } from "@/lib/errors";

/**
 * Validation for the chat endpoints, kept out of the handlers.
 *
 * Rules stay narrow on purpose: an identifier must look like an identifier, and
 * a number must be a number in range. Each refusal uses ChatbotError, so the
 * response shape a client already handles is unchanged.
 */

export const uuidSchema = z.string().uuid();
export const limitSchema = z.coerce.number().int().min(1).max(50);
export const timestampSchema = z.coerce.number().int().min(0).max(8_640_000_000_000_000);
export const cursorSchema = z.string().min(1).max(64);

export function badRequestParam(name: string, rule: string) {
  return new ChatbotError("bad_request:api", `Parameter ${name} ${rule}`).toResponse();
}

/**
 * Guards a query parameter that may be absent.
 *
 * Absent stays absent: the handler's own "missing parameter" path owns that case,
 * so adding this check cannot change today's behaviour for a caller that simply
 * omits the value.
 */
export function queryParamIsValid<T extends z.ZodTypeAny>(
  raw: string | null,
  schema: T,
  name: string,
  rule: string
): { ok: true } | { ok: false; response: Response } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true };
  }
  return schema.safeParse(raw).success
    ? { ok: true }
    : { ok: false, response: badRequestParam(name, rule) };
}

/** Same idea for a value that is present but may be malformed. */
export function optionalIntIsValid(
  raw: string | null,
  name: string
): { ok: true } | { ok: false; response: Response } {
  return queryParamIsValid(raw, timestampSchema, name, "must be a whole number");
}
