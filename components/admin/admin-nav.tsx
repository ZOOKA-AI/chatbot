"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV, GROUP_LABELS, type AdminNavItem } from "@/lib/admin/nav";

export function AdminNav({ lang }: { lang: "ar" | "en" }) {
  const pathname = usePathname();
  const groups: AdminNavItem["group"][] = ["command", "platform", "operations", "governance"];

  return (
    <nav aria-label={lang === "ar" ? "أقسام لوحة القيادة" : "Command center sections"} className="space-y-4">
      {groups.map((group) => (
        <div key={group}>
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-white/30">
            {lang === "ar" ? GROUP_LABELS[group].ar : GROUP_LABELS[group].en}
          </p>
          <ul className="space-y-0.5">
            {ADMIN_NAV.filter((item) => item.group === group).map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{lang === "ar" ? item.labelAr : item.labelEn}</span>
                    {item.ready ? null : (
                      <span className="rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                        {lang === "ar" ? "لاحقًا" : "later"}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
