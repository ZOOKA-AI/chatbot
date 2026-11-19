/**
 * One request id per request, safe to echo.
 *
 * A caller may supply x-request-id so its logs line up with ours, but the value
 * is reflected into a response header and into log lines, so it is accepted
 * only in a strict shape. Anything else is replaced, never sanitised.
 */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestIdFrom(headers: Headers): string {
  const supplied = headers.get("x-request-id");
  if (supplied && SAFE_ID.test(supplied)) {
    return supplied;
  }
  return globalThis.crypto.randomUUID();
}

/**
 * A browser asking for a page (address bar, link, OAuth redirect) as opposed to
 * code calling an endpoint. Browsers send Sec-Fetch-Mode; older clients are
 * recognised by an Accept header that asks for HTML.
 */
export function isNavigation(headers: Headers): boolean {
  const mode = headers.get("sec-fetch-mode");
  if (mode) {
    return mode === "navigate";
  }
  return (headers.get("accept") ?? "").includes("text/html");
}
