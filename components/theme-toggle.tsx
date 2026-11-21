"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Light / dark switch for public pages. The app sidebar already has its own
 * switch in the user menu; both write the same next-themes value.
 */
export function ThemeToggle({
  lang,
  className,
}: {
  lang: "ar" | "en";
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = !mounted || resolvedTheme !== "light";
  const label =
    lang === "ar"
      ? dark
        ? "التبديل إلى الوضع الفاتح"
        : "التبديل إلى الوضع الداكن"
      : dark
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <button
      aria-label={label}
      className={
        className ??
        "border-border hover:bg-muted focus-visible:ring-ring inline-flex size-11 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      }
      data-testid="theme-toggle"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={label}
      type="button"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
