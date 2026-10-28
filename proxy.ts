import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (
    pathname === "/pricing" ||
    pathname === "/contact" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/embed" ||
    pathname === "/embed.js" ||
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
      (pathname === "/api/chat" && request.method === "POST"))
  ) {
    return NextResponse.next();
  }

  if (!token && !["/login", "/register"].includes(pathname)) {
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
