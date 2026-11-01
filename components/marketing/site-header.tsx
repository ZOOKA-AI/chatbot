"use client";

import { PRODUCT_NAME } from "@/lib/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { CTA } from "@/lib/marketing/cta";
import { NAV_GROUPS } from "@/lib/site-nav";

type Lang = "ar" | "en";

export function SiteHeader({ lang }: { lang: Lang }) {
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b17]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link className="flex items-center gap-2 font-semibold" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={PRODUCT_NAME}
            className="h-9 w-9 rounded-lg"
            height={36}
            src="/images/zooka-logo-120.png"
            width={36}
          />
          <span className="text-base tracking-tight">{PRODUCT_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {NAV_GROUPS.map((group) => (
            <div className="group relative" key={group.en}>
              <button
                aria-haspopup="true"
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                type="button"
              >
                {t(group.ar, group.en)}
                <ChevronDown className="size-3.5 transition-transform group-hover:rotate-180" />
              </button>
              <div className="invisible absolute start-0 top-full w-[23rem] translate-y-1 rounded-2xl border border-white/10 bg-[#0b1120] p-2 opacity-0 shadow-2xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {group.items.map((item) => (
                  <Link
                    className="flex flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
                    href={item.href}
                    key={item.href}
                  >
                    <span className="font-medium text-foreground">
                      {t(item.ar, item.en)}
                    </span>
                    {item.hintAr ? (
                      <span className="text-muted-foreground text-xs">
                        {t(item.hintAr, item.hintEn ?? item.hintAr)}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link
            className={`rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-foreground ${
              pathname === "/pricing" ? "text-foreground" : "text-muted-foreground"
            }`}
            href="/pricing"
          >
            {t("الأسعار", "Pricing")}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle
            className="hidden rounded-lg border border-white/15 px-3 py-1.5 text-sm transition-colors hover:bg-white/5 sm:block"
            lang={lang}
          />
          <Link
            className="hidden rounded-lg px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground sm:block"
            href="/login"
          >
            {t("تسجيل الدخول", "Sign in")}
          </Link>
          <Link
            className="rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm"
            href={CTA.workspace.href}
          >
            {isArabic ? CTA.workspace.ar : CTA.workspace.en}
          </Link>
          <button
            aria-expanded={open}
            aria-label={t("القائمة", "Menu")}
            className="rounded-lg border border-white/15 p-2 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/10 bg-[#070b17] lg:hidden">
          <div className="mx-auto grid w-full max-w-6xl gap-1 px-5 py-3">
            {NAV_GROUPS.map((group) => (
              <div className="grid gap-1" key={group.en}>
                <p className="px-3 pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t(group.ar, group.en)}
                </p>
                {group.items.map((item) => (
                  <Link
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="text-sm">{t(item.ar, item.en)}</span>
                    {item.hintAr ? (
                      <span className="text-muted-foreground text-[11px]">
                        {t(item.hintAr, item.hintEn ?? item.hintAr)}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            ))}
            <div className="mt-2 flex items-center gap-2 border-white/10 border-t pt-3">
              <Link
                className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-center text-sm"
                href="/login"
                onClick={() => setOpen(false)}
              >
                {t("تسجيل الدخول", "Sign in")}
              </Link>
              <LanguageToggle
                className="rounded-lg border border-white/15 px-3 py-2 text-sm"
                lang={lang}
              />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
