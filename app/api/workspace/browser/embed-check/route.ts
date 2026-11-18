import { embedVerdict } from "@/lib/browser/embed-policy";
import { assessUrl } from "@/lib/browser/url-policy";
import { OutboundBlocked, guardedFetch } from "@/lib/studio/outbound-guard";
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
    // The typed URL was assessed above, but where the request lands is decided by the response. A public
    // host answering 302 to 169.254.169.254 or to loopback must be a refusal, not a request made from
    // inside the network, so every hop is assessed (guardedFetch uses redirect: manual internally).
    const response = await guardedFetch(policy.url, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ZookaBrowser/1.0)",
        accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    const judgement = embedVerdict({
      xFrameOptions: response.headers.get("x-frame-options"),
      contentSecurityPolicy: response.headers.get("content-security-policy"),
    });

    const verdict: Verdict = {
      embeddable: judgement.embeddable,
      reason: judgement.reason,
      finalUrl: response.url || policy.url,
      detail: judgement.detail,
    };
    return Response.json(verdict, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OutboundBlocked) {
      const blocked: Verdict = {
        embeddable: false,
        reason: "unsafe_url",
        finalUrl: null,
        detail: error.reason,
      };
      return Response.json(blocked, { headers: { "cache-control": "no-store" } });
    }
    const verdict: Verdict = {
      embeddable: false,
      reason: "unreachable",
      finalUrl: null,
      detail: error instanceof Error ? error.name : "fetch_failed",
    };
    return Response.json(verdict, { headers: { "cache-control": "no-store" } });
  }
}
