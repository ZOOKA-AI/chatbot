/**
 * Keeping a live session alive across requests.
 *
 * The honest reason this module exists: a serverless function forgets the browser it opened as
 * soon as the response is sent, so the frame and input routes would answer "no live browser" while
 * the customer's browser is still running. The fix is not to fake continuity in the UI. It is to
 * reconnect to the same endpoint and adopt the tab that is already there.
 *
 * The reconnect needs an endpoint that outlives one connection. A one-shot managed Chromium (the
 * Browserless stealth token) gives a fresh browser per connect, so adopting a tab there would be a
 * different browser wearing the same session id. Only BROWSER_CDP_URL counts as resumable, and when
 * it is absent the caller is told the engine cannot be resumed rather than shown an old picture.
 */
import { browserRuntime } from "./runtime";

export function resumableEndpoint(): string | null {
  const raw = process.env.BROWSER_CDP_URL?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export type ResumeOutcome =
  | { ok: true; adopted: "already_live" | "existing_tab" | "new_tab" }
  | { ok: false; code: string; message: string };

/** Make sure this session has a live browser in the current process. */
export async function ensureLiveBrowser(input: {
  sessionId: string;
  organizationId: string;
  preferredUrl?: string;
}): Promise<ResumeOutcome> {
  const runtime = browserRuntime();
  if (runtime.has(input.sessionId, input.organizationId)) {
    return { ok: true, adopted: "already_live" };
  }
  const endpoint = resumableEndpoint();
  if (!endpoint) {
    return {
      ok: false,
      code: "engine_not_resumable",
      message:
        "this engine hands out a fresh browser per connection, so the live tab cannot be adopted",
    };
  }
  const result = await runtime.reattach(
    input.sessionId,
    input.organizationId,
    endpoint,
    input.preferredUrl,
  );
  if (result.ok === false) return { ok: false, code: result.code, message: result.message };
  return { ok: true, adopted: result.adopted };
}
