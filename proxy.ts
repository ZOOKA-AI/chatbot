import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";
import { isNavigation, requestIdFrom } from "./lib/http/request-id";
import { verifySharedSecret } from "./lib/webhooks/security";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  parseAttribution,
  serializeAttribution,
} from "./lib/growth/attribution";

/**
 * Routes that require an authenticated session. Anything not listed here is
 * either public or a genuine 404, so unknown URLs reach Next.js and render the
 * not-found page instead of bouncing visitors to the login screen.
 */
/**
 * Endpoints an autonomous agent calls with its own key rather than a browser session.
 * Kept to the narrowest list: the worker and its heartbeat, both of which authenticate the
 * key themselves and refuse with 401 when it is missing or invalid.
 */
const AGENT_KEY_ENDPOINTS = ["/api/agents/worker", "/api/agents/heartbeat"];

/**
 * TikTok keeps its existing route-level authentication. The growth report
 * requires a valid machine credential at both the proxy and the handler.
 */
const N8N_SERVICE_ENDPOINT = "/api/integrations/n8n/tiktok/run";
const N8N_GROWTH_REPORT = "/api/integrations/n8n/growth/report";

const PROTECTED_PREFIXES = [
  "/chat",
  "/settings",
  "/workspace",
  "/account",
  "/agents",
  "/work",
  "/admin",
  "/api",
];

export async function proxy(request: NextRequest) {
  const requestId = requestIdFrom(request.headers);
  const response = await route(request, requestId);
  response.headers.set("x-request-id", requestId);
  rememberAttribution(request, response);
  return response;
}

/**
 * Records the acquisition channel on the visitor's first landing.
 *
 * First touch wins, so an existing cookie is never overwritten: a visitor who
 * arrived from an AI assistant and later returns through a direct visit must
 * still be credited to the assistant, otherwise every channel report drifts
 * towards "direct". Internal navigation and direct visits write nothing, so a
 * plain page view never invents a channel.
 *
 * The cookie is httpOnly because only the server reads it at sign-up, and the
 * visitor's own browser scripts have no use for it.
 */
function rememberAttribution(request: NextRequest, response: Response) {
  if (request.method !== "GET" || !(response instanceof NextResponse)) {
    return;
  }
  if (request.cookies.get(ATTRIBUTION_COOKIE)?.value) {
    return;
  }
  const attribution = parseAttribution(
    request.nextUrl,
    request.headers.get("referer")
  );
  if (!attribution) {
    return;
  }
  response.cookies.set({
    name: ATTRIBUTION_COOKIE,
    value: serializeAttribution(attribution),
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

async function route(request: NextRequest, requestId: string) {
  const { pathname } = request.nextUrl;

  if (
    process.env.VERCEL_ENV === "production" &&
    request.nextUrl.host !== "zooka-ai.com" &&
    (pathname === "/login" ||
      pathname === "/register" ||
      pathname === "/api/auth" ||
      pathname.startsWith("/api/auth/"))
  ) {
    const url = new URL("https://zooka-ai.com");
    url.pathname = pathname;
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url, 307);
  }

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  /*
   * Google Search Console / OAuth ownership verification serves a static
   * google<token>.html file at the site root and must return it without auth.
   */
  if (/^\/google[0-9a-zA-Z]+\.html$/.test(pathname)) {
    return NextResponse.next();
  }

  /*
   * One-shot schema endpoint: authenticated by its own x-migration-token
   * header, so it must reach the route handler rather than a login redirect.
   */
  if (pathname === "/api/admin/migrate") {
    return NextResponse.next();
  }

  /*
   * Machine access is scoped to POST on exact paths. The growth route must
   * never be added to the anonymous-route inventory.
   */
  if (request.method === "POST" && pathname === N8N_SERVICE_ENDPOINT) {
    return NextResponse.next();
  }

  if (request.method === "POST" && pathname === N8N_GROWTH_REPORT) {
    const secret = process.env.N8N_GROWTH_REPORT_SECRET;
    if (!verifySharedSecret(request.headers.get("x-n8n-secret"), secret)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // Machine callback authenticates its raw body using HMAC, not a browser session.
  if (pathname === "/api/media-engine/callback") {
    return NextResponse.next();
  }

  /*
   * An unsubscribe link is opened by someone who was invited and has no account
   * here, so a session gate would make the promise in the email impossible to
   * keep. The route authorises the request itself: the token is derived from the
   * address, and a mismatch is refused with 400 before anything is written.
   */
  if (pathname === "/api/growth/unsubscribe") {
    return NextResponse.next();
  }

  // These exact endpoints require workspace sessions themselves and return JSON 401.
  if (
    pathname === "/api/media-engine" ||
    pathname === "/api/domains" ||
    pathname === "/api/agent" ||
    pathname === "/api/projects"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (
    pathname === "/" ||
    pathname === "/pricing" ||
    pathname === "/about" ||
    pathname === "/contact" ||
    pathname === "/cookies" ||
    pathname === "/partners" ||
    pathname === "/partners/join" ||
    pathname === "/pricing" ||
    pathname === "/contact" ||
    pathname === "/privacy" ||
    pathname === "/privacy-policy" ||
    pathname === "/terms-of-use" ||
    pathname === "/refund" ||
    pathname === "/terms" ||
    pathname === "/embed" ||
    pathname === "/embed.js" ||
    pathname === "/api/demo-chat" ||
    pathname === "/api/guest-quota" ||
    // Machine-to-machine webhooks: every route verifies its own provider
    // signature or shared secret, so they must never be bounced to /login.
    pathname.startsWith("/api/webhooks") ||
    pathname === "/api/stripe/webhook" ||
    pathname === "/api/admin/backup" ||
    // Machine-to-machine: the ingest route authenticates with x-leads-key,
    // so it must not be bounced to the login page.
    pathname === "/api/leads/ingest" ||
    // Phone sign-in: the route issues and verifies one-time codes with its own
    // rate limits before any session exists, so it must stay reachable.
    pathname === "/api/phone-auth" ||
    // MCP clients authenticate with a workspace bearer key, not a browser
    // session, so the endpoint must not be bounced to /login.
    pathname === "/api/mcp" ||
    // Private publishing endpoint for n8n: bearer workspace key, not a session.
    pathname === "/api/publish" ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/lp/") ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/api/blog/")
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/images/") ||
    pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  // Agent command center: an agent presents a bearer key, not a browser
  // session, and every route under /api/agents authenticates it through
  // resolveCaller(). Without this the machine half of the API was unreachable:
  // the request was bounced to /login before the key was ever read.
  if (
    pathname.startsWith("/api/agents/") &&
    /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  // Anonymous visitors may try the chat when the guest paywall is enabled at
  // launch; the chat API enforces the free-message limit. Default is off, so
  // unauthenticated users are redirected to /login (locked behavior).
  if (
    process.env.GUEST_PAYWALL_ENABLED === "true" &&
    !token &&
    (pathname === "/" ||
      pathname === "/api/guest-quota" ||
      (pathname === "/api/chat" && request.method === "POST"))
  ) {
    return NextResponse.next();
  }

  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!token && isProtectedRoute) {
    // An agent presents its own bearer key instead of a browser session. These
    // endpoints authenticate that key themselves and answer 401 when it is
    // absent or invalid, so letting the request reach them is not a bypass.
    const presentsAgentKey =
      (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ") ||
      Boolean(request.headers.get("x-agent-key"));
    const isAgentEndpoint = AGENT_KEY_ENDPOINTS.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    if (presentsAgentKey && isAgentEndpoint) {
      return NextResponse.next();
    }

    const isApi = pathname === "/api" || pathname.startsWith("/api/");
    // Code calling an endpoint gets an answer it can act on: a redirect made
    // fetch() follow it and hand the caller 200 + HTML, which reads as success.
    // Browser navigations still go to the login screen.
    if (isApi && !isNavigation(request.headers)) {
      return NextResponse.json(
        {
          code: "unauthorized:auth",
          message: "You need to sign in before continuing.",
          error: "unauthorized",
          requestId,
        },
        { status: 401, headers: { "cache-control": "private, no-store" } }
      );
    }

    // Guest auto-provisioning disabled: require real sign-up
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
