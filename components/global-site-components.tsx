"use client";

import { useEffect, useState } from "react";
import { CookieConsent } from "@/components/cookie-consent";
import { SiteFooter } from "@/components/site-footer";
import type { Lang } from "@/lib/i18n";

export function GlobalSiteComponents({ year }: { year: number }) {
  const [lang, setLang] = useState<Lang>("ar");

  useEffect(() => {
    const savedLang = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("zooka_lang="))
      ?.split("=")[1];
    const nextLang = savedLang === "en" ? "en" : "ar";
    setLang(nextLang);
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "ar" ? "rtl" : "ltr";
  }, []);

  return (
    <>
      <SiteFooter lang={lang} year={year} />
      <CookieConsent lang={lang} />
    </>
  );
}
