"use client";

import { useState } from "react";

import { HUB_ACCOUNTS, type HubAccount } from "@/lib/social-accounts";

export type { HubAccount, HubStatus } from "@/lib/social-accounts";


const CATEGORIES: { id: HubAccount["category"]; ar: string; en: string }[] = [
  { id: "social", ar: "الشبكات الاجتماعية", en: "Social Networks" },
  { id: "developer", ar: "منصات المطورين", en: "Developer Platforms" },
  { id: "community", ar: "المجتمع", en: "Community" },
  { id: "support", ar: "الدعم والتواصل", en: "Support" },
];

function PlatformIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      aria-label={label}
      className="rounded-md border px-2 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
      onClick={copy}
      type="button"
    >
      {copied ? "تم النسخ ✓" : "نسخ"}
    </button>
  );
}

function ShareButton() {
  const [state, setState] = useState<"idle" | "done">("idle");

  async function share() {
    const url = "https://zooka-ai.com/social";
    const data = {
      title: "ZOOKA-AI — الحسابات الرسمية",
      text: "كل حسابات ZOOKA-AI الرسمية في مكان واحد.",
      url,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(url);
      }
      setState("done");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-muted"
      onClick={share}
      type="button"
    >
      {state === "done" ? "تم ✓" : "شارك الصفحة"}
    </button>
  );
}

export function SocialHub() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ShareButton />
        <a
          className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-muted"
          href="https://zooka-ai.com"
          rel="noopener noreferrer"
        >
          الموقع الرسمي ↗
        </a>
      </div>

      {CATEGORIES.map((category) => {
        const items = HUB_ACCOUNTS.filter((a) => a.category === category.id);
        if (items.length === 0) return null;

        return (
          <section className="flex flex-col gap-4" key={category.id}>
            <div className="flex items-baseline justify-between gap-3 border-b pb-2">
              <h2 className="font-semibold text-lg">{category.ar}</h2>
              <span className="text-muted-foreground text-xs">
                {category.en}
              </span>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((account) => {
                const live = account.status === "live" && account.href;
                return (
                  <li
                    className="flex items-center justify-between gap-3 rounded-xl border p-4"
                    key={account.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-muted-foreground">
                        <PlatformIcon path={account.path} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {live ? (
                            <a
                              className="hover:underline"
                              href={account.href}
                              rel="me noopener noreferrer"
                              target="_blank"
                            >
                              {account.label}
                            </a>
                          ) : (
                            account.label
                          )}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {account.handle}
                        </p>
                        {account.note ? (
                          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
                            {account.note}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {live ? (
                      <CopyButton
                        label={`نسخ رابط ${account.label}`}
                        value={account.href as string}
                      />
                    ) : (
                      <span className="shrink-0 rounded-full border border-amber-500/40 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-500">
                        قيد المراجعة
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
