"use client";

import { useState } from "react";

/**
 * Sharing affordances. Nothing is posted to a social account from here: each
 * button hands the text to the platform's own share URL or to the device share
 * sheet, so the user stays in control of what leaves their account.
 */
export function ShareButtons({
  link,
  textAr,
  textEn,
  lang,
}: {
  link: string;
  textAr: string;
  textEn: string;
  lang: "ar" | "en";
}) {
  const [copied, setCopied] = useState(false);
  const text = lang === "ar" ? textAr : textEn;
  const message = `${text} ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  const mail = `mailto:?subject=${encodeURIComponent(lang === "ar" ? "انضم إلى ZOOKA-AI" : "Join ZOOKA-AI")}&body=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "ZOOKA-AI", text, url: link });
      } catch {
        /* the user dismissed the sheet */
      }
    }
  }

  const base =
    "flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition hover:opacity-90";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <a className={`${base} border-emerald-500/40 text-emerald-600`} href={wa} target="_blank" rel="noreferrer">
        WhatsApp
      </a>
      <a className={`${base} border-sky-500/40 text-sky-600`} href={tg} target="_blank" rel="noreferrer">
        Telegram
      </a>
      <a className={`${base} border-slate-400/40`} href={mail}>
        {lang === "ar" ? "البريد" : "Email"}
      </a>
      <button type="button" onClick={nativeShare} className={`${base} border-violet-500/40 text-violet-600`}>
        {lang === "ar" ? "مشاركة" : "Share"}
      </button>
      <button type="button" onClick={copy} className={`${base} border-[#2E86AB]/50 text-[#2E86AB]`}>
        {copied ? (lang === "ar" ? "تم النسخ" : "Copied") : lang === "ar" ? "نسخ الرابط" : "Copy link"}
      </button>
    </div>
  );
}
