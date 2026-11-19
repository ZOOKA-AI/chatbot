/**
 * The one switch that decides whether billable engines may run.
 *
 * It lives in its own module with no `server-only` marker because the engine ladder is read by the
 * studio UI as well as by the server, and both must agree on the same answer. Two flags with two
 * meanings is how a "disabled" provider gets selected anyway, so there is exactly one here and every
 * layer imports it.
 */

export type Env = Record<string, string | undefined>;

export const DEFAULT_SPEND_CAP_USD = 0.5;

/** Paid generation is off unless an operator turns it on. One switch, one meaning. */
export function paidGenerationEnabled(env: Env = process.env): boolean {
  return env.PAID_GENERATION_ENABLED === "true" || env.STUDIO_ALLOW_PAID_PROVIDERS === "1";
}

export function spendCapUsd(env: Env = process.env): number {
  const raw = Number(env.RUNCOMFY_MAX_SPEND_USD ?? DEFAULT_SPEND_CAP_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SPEND_CAP_USD;
}
