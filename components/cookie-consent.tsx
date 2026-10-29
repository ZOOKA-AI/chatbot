"use client";

import { Analytics } from "@vercel/analytics/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

const CONSENT_KEY = "zooka-cookie-consent";

export function CookieConsent({ lang }: { lang: Lang }) {
  const [consent, setConsent] = useState<"accepted" | "rejected" | null>(null);

  useEffect(() => {
    const savedConsent = localStorage.getItem(CONSENT_KEY);
    if (savedConsent === "accepted" || savedConsent === "rejected") {
      setConsent(savedConsent);
    }
  }, []);

  const saveConsent = (value: "accepted" | "rejected") => {
    localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
  };

  return (
    <>
      {consent === "accepted" && <Analytics />}
      {consent === null && (
        <aside
          aria-label={
            lang === "ar" ? "إعدادات ملفات الارتباط" : "Cookie preferences"
          }
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border bg-background p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between"
          dir={lang === "ar" ? "rtl" : "ltr"}
          lang={lang}
          role="dialog"
        >
          <p className="text-sm leading-6">
            {lang === "ar"
              ? "نستخدم التخزين الضروري لتشغيل الموقع، والقياس الاختياري بعد موافقتك. "
              : "We use essential storage to run the site and optional analytics only with your consent. "}
            <Link className="underline" href="/cookies">
              {lang === "ar" ? "التفاصيل" : "Details"}
            </Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => saveConsent("rejected")}
              type="button"
            >
              {lang === "ar" ? "الضروري فقط" : "Necessary only"}
            </button>
            <button
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              onClick={() => saveConsent("accepted")}
              type="button"
            >
              {lang === "ar" ? "موافقة" : "Accept"}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
