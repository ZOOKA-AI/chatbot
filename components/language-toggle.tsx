"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Language switcher.
 *
 * It used to be a plain button that only wrote the zooka_lang cookie and called
 * location.reload(), so nothing on the site ever linked to /ar and the Arabic
 * landing page was never crawled. It now renders a real href: every Arabic page
 * points at /ar, and /ar points back at /.
 *
 * The pathname is read after mount on purpose. Reading it during render made
 * static prerendering of /blog/[slug] fail ("URL data in a Client Component
 * outside of Suspense"); the server HTML keeps the language default, and the
 * href corrects itself as soon as the page hydrates.
 */
export function LanguageToggle({
  lang,
  className,
}: {
  lang: "ar" | "en";
  className?: string;
}) {
  const [onArabicRoute, setOnArabicRoute] = useState<boolean | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    setOnArabicRoute(path === "/ar" || path.startsWith("/ar/"));
  }, []);

  const target: "ar" | "en" = onArabicRoute ? "en" : "ar";
  const label = target === "ar" ? "العربية" : "English";
  const href = onArabicRoute === true ? "/" : "/ar";

  return (
    <Link
      href={href}
      hrefLang={target}
      rel="alternate"
      prefetch={false}
      aria-label={target === "ar" ? "التبديل إلى العربية" : "Switch to English"}
      className={
        className ??
        "border-border bg-background hover:bg-muted absolute top-4 end-4 z-10 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-medium text-sm transition-colors"
      }
      onClick={() => {
        document.cookie = `zooka_lang=${target}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {label}
    </Link>
  );
}
