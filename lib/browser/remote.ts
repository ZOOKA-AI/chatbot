/**
 * Where the real browser actually runs.
 *
 * A serverless function cannot launch Chromium: there is no binary, no writable image and no
 * long-lived process. So the runtime has two ways to reach a real browser, both remote and both
 * opt-in through the environment. Without either, the browser is reported as not provisioned rather
 * than pretended, which is what the panel says to the customer.
 */
export type RemoteEndpoint = {
  url: string;
  engine: "remote_cdp" | "browserbase";
};

function browserbaseEndpoint(): { url: string; engine: "browserbase" } | null {
  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  return {
    // Resolved lazily in createRemoteBrowserbaseSession; the URL is per session, not static.
    url: `browserbase://${projectId}`,
    engine: "browserbase",
  };
}

/** A plain CDP endpoint (self-hosted Chromium, Steel, Hyperbrowser, any wss:// DevTools URL). */
export function staticRemoteEndpoint(): RemoteEndpoint | null {
  const url = process.env.BROWSER_CDP_URL?.trim();
  if (url) return { url, engine: "remote_cdp" };
  return browserbaseEndpoint();
}

export function remoteConfigured(): boolean {
  return staticRemoteEndpoint() !== null;
}

/**
 * Creates a Browserbase session and returns its DevTools WebSocket, which is what connectOverCDP
 * needs. Returns null when Browserbase is not configured, and throws with the provider's own message
 * when it is configured but refuses, so the panel can show a real reason.
 */
export async function createBrowserbaseSession(): Promise<string | null> {
  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;

  const response = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-bb-api-key": apiKey },
    body: JSON.stringify({ projectId }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `browserbase_session_failed:${response.status}:${detail.slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as { connectUrl?: string };
  if (!data.connectUrl)
    throw new Error("browserbase_session_failed:no_connect_url");
  return data.connectUrl;
}
