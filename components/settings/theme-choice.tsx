"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { id: "dark", icon: Moon, ar: "داكن", en: "Dark" },
  { id: "light", icon: Sun, ar: "فاتح", en: "Light" },
  { id: "system", icon: Monitor, ar: "حسب الجهاز", en: "System" },
] as const;

/** Dark / Light / System, as a radio group. Writes the same next-themes value as every other switch. */
export function ThemeChoice({ lang }: { lang: "ar" | "en" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : undefined;

  return (
    <fieldset className="grid grid-cols-3 gap-2 border-0 p-0">
      <legend className="sr-only">
        {lang === "ar" ? "مظهر الواجهة" : "Appearance"}
      </legend>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = current === option.id;
        return (
          <button
            aria-pressed={active}
            className={`focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            key={option.id}
            onClick={() => setTheme(option.id)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-4" />
            {lang === "ar" ? option.ar : option.en}
          </button>
        );
      })}
    </fieldset>
  );
}
