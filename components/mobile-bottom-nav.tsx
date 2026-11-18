"use client";

import { Bot, House, Menu, MessageSquareText, Palette } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBilling } from "@/components/billing-provider";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Persistent five-item navigation for phones.
 *
 * Hidden on chat screens: the composer owns the bottom of the screen there, and
 * a second fixed bar would cover it when the keyboard opens. "More" opens the
 * full sidebar, so nothing reachable on desktop is lost on mobile.
 */
export function MobileBottomNav() {
  const pathname = usePathname() ?? "/";
  const { lang } = useBilling();
  const { setOpenMobile } = useSidebar();
  const ar = lang === "ar";

  if (pathname === "/" || pathname.startsWith("/chat/")) {
    return null;
  }

  const items = [
    { href: "/workspace/home", icon: House, ar: "الرئيسية", en: "Home", match: (p: string) => p === "/workspace/home" },
    { href: "/", icon: MessageSquareText, ar: "المحادثة", en: "Chat", match: () => false },
    {
      href: "/workspace/agents",
      icon: Bot,
      ar: "الوكلاء",
      en: "Agents",
      match: (p: string) => p.startsWith("/workspace/agent"),
    },
    {
      href: "/dashboard/studio",
      icon: Palette,
      ar: "الاستوديو",
      en: "Studio",
      match: (p: string) => p.includes("/studio"),
    },
  ];

  return (
    <>
      {/* Keeps the last content row clear of the fixed bar. */}
      <div aria-hidden="true" className="h-20 md:hidden" />
      <nav
        aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        dir={ar ? "rtl" : "ltr"}
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]",
                    active ? "font-semibold text-violet-400" : "text-muted-foreground"
                  )}
                  href={item.href}
                >
                  <item.icon aria-hidden="true" className="size-5" />
                  {ar ? item.ar : item.en}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
              onClick={() => setOpenMobile(true)}
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" />
              {ar ? "المزيد" : "More"}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
