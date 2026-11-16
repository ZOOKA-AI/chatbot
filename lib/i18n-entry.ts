import { NextResponse } from "next/server";
import type { Lang } from "@/lib/i18n";

/**
 * Language entry points.
 *
 * ZOOKA-AI switches language with the `zooka_lang` cookie rather than by
 * duplicating every page under a `/en` tree, so `/en` and `/ar` are not pages
 * and used to return 404. These handlers turn them into real entry points:
 * set the cookie, then redirect to the requested page (or home).
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

export function languageEntry(lang: Lang, request: Request, segments: string[] = []) {
  const url = new URL(request.url);
  const target = segments.length ? `/${segments.join("/")}` : "/";
  const next = url.searchParams.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : target;

  const response = NextResponse.redirect(new URL(destination, url.origin), 307);
  response.cookies.set("zooka_lang", lang, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
  return response;
}
