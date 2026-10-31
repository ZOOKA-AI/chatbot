"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

type Lang = "ar" | "en";

type MenuItem = { label: string; href: string; hint: string };

type MenuGroup = { label: string; items: MenuItem[] };

export function SiteHeader({ lang }: { lang: Lang }) {
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [open, setOpen] = useState(false);

  const groups: MenuGroup[] = [
    {
      label: t("المنتج", "Product"),
      items: [
        {
          label: t("المميزات والبوسترات", "Features & posters"),
          href: "#posters",
          hint: t("شوف التطبيق في 6 بوسترات", "Six posters that show the app"),
        },
        {
          label: t("فيديو تعريفي", "Demo video"),
          href: "#video",
          hint: t("دقيقة واحدة تشرح كل حاجة", "One minute that explains it all"),
        },
        {
          label: t("ماذا ينفّذ فعليًا", "What it does"),
          href: "#capabilities",
          hint: t("قدرات مبنية ومختبَرة", "Capabilities built and tested"),
        },
        {
          label: t("التكاملات", "Integrations"),
          href: "#integrations",
          hint: t("26 تكاملًا في الكتالوج", "26 integrations in the catalog"),
        },
      ],
    },
    {
      label: t("الحلول", "Solutions"),
      items: [
        {
          label: t("شركات التنظيف والخدمات", "Cleaning & services"),
          href: "#use-cases",
          hint: t("ردود العملاء، الفواتير، المتابعة", "Customer replies, invoices, follow-up"),
        },
        {
          label: t("المتاجر والمبيعات", "Retail & sales"),
          href: "#use-cases",
          hint: t("طلبات، مخزون، عروض", "Orders, stock, offers"),
        },
        {
          label: t("المكاتب والفرق", "Offices & teams"),
          href: "#use-cases",
          hint: t("تقارير، بريد، اجتماعات", "Reports, email, meetings"),
        },
        {
          label: t("المقارنة", "Why Zooka"),
          href: "#compare",
          hint: t("الفرق عن مساعد محادثة عادي", "Not another chat assistant"),
        },
      ],
    },
    {
      label: t("الأسعار", "Pricing"),
      items: [
        {
          label: t("الباقات الأربع", "The four plans"),
          href: "#plans",
          hint: t("مجاني، احترافي، أعمال، مؤسسات", "Free, Pro, Business, Enterprise"),
        },
        {
          label: t("الأمان والخصوصية", "Security & privacy"),
          href: "#security",
          hint: t("تشفير وعزل وسجل تدقيق", "Encryption, isolation, audit"),
        },
        {
          label: t("الأسئلة الشائعة", "FAQ"),
          href: "#faq",
          hint: t("إجابات مباشرة", "Straight answers"),
        },
        {
          label: t("تواصل معنا", "Contact"),
          href: "/contact",
          hint: t("للشركات والفروع", "For companies and branches"),
        },
      ],
    },
  ];

  const flat = groups.flatMap((group) => group.items);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b17]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link className="flex items-center gap-2 font-semibold" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Zooka AI"
            className="h-9 w-9 rounded-lg"
            height={36}
            src="/images/zooka-logo-120.png"
            width={36}
          />
          <span className="text-base tracking-tight">Zooka AI</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {groups.map((group) => (
            <div className="group relative" key={group.label}>
              <button
                aria-haspopup="true"
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                type="button"
              >
                {group.label}
                <ChevronDown className="size-3.5 transition-transform group-hover:rotate-180" />
              </button>
              <div className="invisible absolute start-0 top-full w-[22rem] translate-y-1 rounded-2xl border border-white/10 bg-[#0b1120] p-2 opacity-0 shadow-2xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {group.items.map((item) => (
                  <a
                    className="flex flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
                    href={item.href}
                    key={item.label}
                  >
                    <span className="font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {item.hint}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
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
            href="/register"
          >
            {t("ابدأ مجانًا", "Start free")}
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
            {flat.map((item) => (
              <a
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
                href={item.href}
                key={`${item.href}-${item.label}`}
                onClick={() => setOpen(false)}
              >
                <span className="text-sm">{item.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {item.hint}
                </span>
              </a>
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
