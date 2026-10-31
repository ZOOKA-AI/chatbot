import "server-only";

export type N8nValidationResult = {
  ok: boolean;
  workflowCount?: number;
  error?: "unreachable" | "unauthorized" | "bad_response";
};

/**
 * Checks a user's own n8n instance with their own API key before storing it, so
 * a mistyped URL or a revoked key is caught at save time instead of silently
 * failing later inside an agent run.
 */
export async function validateN8nCredentials(
  baseUrl: string,
  apiKey: string
): Promise<N8nValidationResult> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/workflows?limit=1`, {
      headers: { "X-N8N-API-KEY": apiKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "unauthorized" };
    }
    if (!response.ok) {
      return { ok: false, error: "bad_response" };
    }
    const payload = (await response.json()) as { data?: unknown[] };
    return {
      ok: true,
      workflowCount: Array.isArray(payload.data) ? payload.data.length : 0,
    };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}
