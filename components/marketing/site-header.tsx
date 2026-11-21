"use client";

import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { CTA } from "@/lib/marketing/cta";

type Lang = "ar" | "en";

type MenuItem = { label: string; href: string; hint: string };

type MenuGroup = { label: string; items: MenuItem[] };

export function SiteHeader({ lang }: { lang: Lang }) {
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Escape closes the phone menu and hands focus back to the button that
  // opened it (the audit found aria-expanded stuck at true after Escape).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const groups: MenuGroup[] = [
    {
      label: t("المنتج", "Product"),
      items: [
        {
          label: t("المميزات والبوسترات", "Features & posters"),
          href: "/#posters",
          hint: t("شوف التطبيق في 6 بوسترات", "Six posters that show the app"),
        },
        {
          label: t("فيديو تعريفي", "Demo video"),
          href: "/#video",
          hint: t("دقيقة واحدة تشرح كل حاجة", "One minute that explains it all"),
        },
        {
          label: t("قوالب مهام جاهزة", "Ready-made tasks"),
          href: "/#templates",
          hint: t("مهمة تتنفّذ بضغطة واحدة", "A task that runs in one tap"),
        },
        {
          label: t("ماذا ينفّذ فعليًا", "What it does"),
          href: "/#capabilities",
          hint: t("قدرات مبنية ومختبَرة", "Capabilities built and tested"),
        },
        {
          label: t("التكاملات", "Integrations"),
          href: "/#integrations",
          hint: t("26 تكاملًا في الكتالوج", "26 integrations in the catalog"),
        },
      ],
    },
    {
      label: t("الحلول", "Solutions"),
      items: [
        {
          label: t("شركات التنظيف والخدمات", "Cleaning & services"),
          href: "/#use-cases",
          hint: t("ردود العملاء، الفواتير، المتابعة", "Customer replies, invoices, follow-up"),
        },
        {
          label: t("المتاجر والمبيعات", "Retail & sales"),
          href: "/#use-cases",
          hint: t("طلبات، مخزون، عروض", "Orders, stock, offers"),
        },
        {
          label: t("المكاتب والفرق", "Offices & teams"),
          href: "/#use-cases",
          hint: t("تقارير، بريد، اجتماعات", "Reports, email, meetings"),
        },
        {
          label: t("المقارنة", "Why Zooka"),
          href: "/#compare",
          hint: t("الفرق عن مساعد محادثة عادي", "Not another chat assistant"),
        },
      ],
    },
    {
      label: t("الأسعار", "Pricing"),
      items: [
        {
          label: t("الباقات الأربع", "The four plans"),
          href: "/#plans",
          hint: t("مجاني، احترافي، أعمال، مؤسسات", "Free, Pro, Business, Enterprise"),
        },
        {
          label: t("الأمان والخصوصية", "Security & privacy"),
          href: "/#security",
          hint: t("تشفير وعزل وسجل تدقيق", "Encryption, isolation, audit"),
        },
        {
          label: t("الأسئلة الشائعة", "FAQ"),
          href: "/#faq",
          hint: t("إجابات مباشرة", "Straight answers"),
        },
        {
          label: t("الدعم والمساعدة", "Support & help"),
          href: "/support",
          hint: t("مركز المساعدة والتواصل", "Help center and contact"),
        },
        {
          label: t("تواصل معنا", "Contact"),
          href: "/contact",
          hint: t("للشركات والفروع", "For companies and branches"),
        },
      ],
    },
    {
      label: t("الموارد", "Resources"),
      items: [
        {
          label: t("المطورون — MCP", "Developers — MCP"),
          href: "/settings/mcp",
          hint: t("مفاتيح MCP وكتالوج الأدوات", "MCP keys and the tool catalog"),
        },
        {
          label: "ZOOKA AI TV",
          href: "/tv",
          hint: t("جولات وشروحات بالفيديو", "Video tours and tutorials"),
        },
        {
          label: t("المدونة", "Blog"),
          href: "/blog",
          hint: t("مقالات وتحديثات", "Articles and updates"),
        },
        {
          label: t("الحسابات الرسمية", "Official accounts"),
          href: "/social",
          hint: t("كل قنوات ZOOKA الموثّقة", "Every verified ZOOKA channel"),
        },
      ],
    },
  ];

  const flat = groups.flatMap((group) => group.items);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link className="flex items-center gap-2 font-semibold" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Zooka AI"
            className="h-9 w-9 rounded-lg"
            height={36}
            src="/brand/zooka-mark-256.png"
            width={36}
          />
          <span className="text-base tracking-tight">Zooka AI</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {groups.map((group) => (
            <div className="group relative" key={group.label}>
              <button
                aria-haspopup="true"
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                type="button"
              >
                {group.label}
                <ChevronDown className="size-3.5 transition-transform group-hover:rotate-180" />
              </button>
              <div className="invisible absolute start-0 top-full w-[22rem] translate-y-1 rounded-2xl border border-border bg-popover p-2 opacity-0 shadow-2xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {group.items.map((item) => (
                  <a
                    className="flex flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
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
            className="hidden rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted sm:block"
            lang={lang}
          />
          <ThemeToggle
            className="hidden size-10 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted sm:inline-flex"
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
            aria-controls="site-mobile-menu"
            aria-expanded={open}
            aria-label={t("القائمة", "Menu")}
            className="inline-flex size-11 items-center justify-center rounded-lg border border-border lg:hidden"
            ref={menuButton}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background lg:hidden"
          id="site-mobile-menu"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-1 px-5 py-3">
            {flat.map((item) => (
              <a
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
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
            <div className="mt-2 flex items-center gap-2 border-border border-t pt-3">
              <Link
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-3 py-2 text-sm"
                href="/login"
                onClick={() => setOpen(false)}
              >
                {t("تسجيل الدخول", "Sign in")}
              </Link>
              <LanguageToggle
                className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm"
                lang={lang}
              />
              <ThemeToggle lang={lang} />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
