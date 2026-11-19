import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";
import { isNavigation, requestIdFrom } from "./lib/http/request-id";

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
 * The refusal a signed-in member receives from the admin command center.
 *
 * It is a real 403 from the proxy, not a rendered page with a 200, because a streamed
 * server render commits its status before a layout can stop it: the layout's own check
 * would arrive too late to mean anything to a client, a log line or a monitor.
 */
const ADMIN_FORBIDDEN_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>403 — لوحة الإدارة</title>
<style>html,body{margin:0;height:100%;background:#050a14;color:#e8eefc;font-family:system-ui,"Segoe UI",Tahoma,sans-serif}
main{display:grid;place-items:center;height:100%;padding:24px;text-align:center}
h1{margin:0 0 8px;font-size:20px;font-weight:600}p{margin:4px 0;color:#93a4c4;font-size:14px}
a{color:#2E86AB;text-decoration:none}code{color:#A23B72}</style></head>
<body><main><div><h1>هذه اللوحة للأدمن فقط</h1>
<p>This command center is admin-only.</p>
<p><code>403</code></p>
<p><a href="/workspace/home">العودة إلى مساحة العمل</a></p></div></main></body></html>`;

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
  return response;
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


  // A signed-in member asking for the command center gets a real 403 here, before the
  // render starts. The role travels inside the session token, so this costs no query;
  // the admin layout still re-checks against the database and refuses the content.
  // When the visitor has explicitly switched workspace the token role describes a
  // different workspace, so the decision is left to that database check rather than
  // guessing from a stale claim.
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  if (token && isAdminRoute) {
    const role = (token as { organizationRole?: string }).organizationRole;
    const switchedWorkspace = request.cookies.get("active-workspace")?.value;
    if (role !== "admin" && role !== "owner" && !switchedWorkspace) {
      return new NextResponse(ADMIN_FORBIDDEN_HTML, {
        status: 403,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-store",
        },
      });
    }
  }

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
