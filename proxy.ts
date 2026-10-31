import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

/**
 * Routes that require an authenticated session. Anything not listed here is
 * either public or a genuine 404, so unknown URLs reach Next.js and render the
 * not-found page instead of bouncing visitors to the login screen.
 */
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
  const { pathname } = request.nextUrl;

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

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
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
    pathname === "/api/webhooks/stripe" ||
    pathname === "/api/stripe/webhook" ||
    pathname === "/api/admin/backup" ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/lp/")
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
