import { assessUrl } from "@/lib/browser/url-policy";
import { getWorkspaceContext } from "@/lib/auth/workspace";

/**
 * Can this page be shown inside our own panel?
 *
 * A live in-app browser has two ways to show a page: embedded in a frame on the customer's screen,
 * or rendered by a browser we control and streamed as pictures. The first is instant and fully
 * interactive but only works when the site allows framing, so it is decided per URL from the site's
 * real response headers instead of by trial and error in the panel.
 */
type Verdict = {
  embeddable: boolean;
  reason:
    | "allowed"
    | "x_frame_options"
    | "frame_ancestors"
    | "unreachable"
    | "unsafe_url";
  finalUrl: string | null;
  detail: string | null;
};

function frameAncestors(csp: string | null): string | null {
  if (!csp) return null;
  const match = csp.match(/frame-ancestors([^;]*)/i);
  return match ? match[1].trim() : null;
}

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const policy = await assessUrl(raw);
  if (!policy.ok) {
    const verdict: Verdict = {
      embeddable: false,
      reason: "unsafe_url",
      finalUrl: null,
      detail: policy.reason,
    };
    return Response.json(verdict, { headers: { "cache-control": "no-store" } });
  }

  try {
    const response = await fetch(policy.url, {
      redirect: "follow",
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ZookaBrowser/1.0)",
        accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    const xfo = response.headers.get("x-frame-options");
    const ancestors = frameAncestors(
      response.headers.get("content-security-policy"),
    );
    const refusal =
      xfo && /deny|sameorigin/i.test(xfo)
        ? "x_frame_options"
        : ancestors && !/(^|\s)\*(\s|$)/.test(ancestors)
          ? "frame_ancestors"
          : "allowed";

    const verdict: Verdict = {
      embeddable: refusal === "allowed",
      reason: refusal as Verdict["reason"],
      finalUrl: response.url || policy.url,
      detail: xfo ?? ancestors ?? null,
    };
    return Response.json(verdict, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const verdict: Verdict = {
      embeddable: false,
      reason: "unreachable",
      finalUrl: null,
      detail: error instanceof Error ? error.name : "fetch_failed",
    };
    return Response.json(verdict, { headers: { "cache-control": "no-store" } });
  }
}
