"use client";

import { useState } from "react";

export type HubStatus = "live" | "pending";

export type HubAccount = {
  id: string;
  label: string;
  handle: string;
  href?: string;
  category: "social" | "developer" | "community" | "support";
  status: HubStatus;
  note?: string;
  path: string;
};

/**
 * Official ZOOKA-AI accounts.
 *
 * Rule: an account is listed with a link only when we own it and it is
 * publicly reachable. Anything under platform review stays visible as a
 * status card without a link, so the page never points visitors at a
 * profile that resolves to "unavailable".
 */
export const HUB_ACCOUNTS: HubAccount[] = [
  {
    id: "facebook",
    label: "Facebook",
    handle: "ZOOKA AI",
    href: "https://www.facebook.com/61596724862442",
    category: "social",
    status: "live",
    path: "M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.3-1.5 1.6-1.5h1.6V4.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.3H7.6V14h2.7v8h3.2Z",
  },
  {
    id: "x",
    label: "X",
    handle: "@zooka_ai",
    href: "https://x.com/zooka_ai",
    category: "social",
    status: "live",
    path: "M17.5 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.2L5.6 21h-3l7.1-8.1L2 3h6.2l4.3 5.7L17.5 3Zm-1 16.2h1.7L7.6 4.7H5.8l10.7 14.5Z",
  },
  {
    id: "youtube",
    label: "YouTube",
    handle: "@zooka_ai_official",
    href: "https://www.youtube.com/@zooka_ai_official",
    category: "social",
    status: "live",
    path: "M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    handle: "zooka-ai",
    href: "https://www.linkedin.com/company/zooka-ai/",
    category: "social",
    status: "live",
    path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.1c.5-1 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6v5.4h-4v-4.8c0-1.1 0-2.6-1.6-2.6s-1.8 1.2-1.8 2.5v4.9h-4v-11Z",
  },
  {
    id: "tiktok",
    label: "TikTok",
    handle: "@zooka.ai7",
    href: "https://www.tiktok.com/@zooka.ai7",
    category: "social",
    status: "live",
    path: "M16.5 3c.4 2 1.7 3.4 3.5 3.7v3.1a7 7 0 0 1-3.5-1v6.4A5.8 5.8 0 1 1 10.7 9.4v3.2a2.7 2.7 0 1 0 2.7 2.6V3h3.1Z",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    handle: "zookaai",
    href: "https://www.pinterest.com/zookaai/",
    category: "social",
    status: "live",
    path: "M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.5 1.9-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.5-.2 1 .5 1.9 1.6 1.9 1.9 0 3.3-2.4 3.3-5.1 0-2.1-1.4-3.7-4-3.7-2.9 0-4.7 2.2-4.7 4.6 0 .8.2 1.4.6 1.9.2.2.2.3.1.6l-.2.8c0 .3-.3.4-.6.2-1.2-.5-1.8-1.9-1.8-3.4 0-2.5 2.1-5.5 6.4-5.5 3.4 0 5.7 2.5 5.7 5.2 0 3.5-2 6.2-4.9 6.2-1 0-1.9-.5-2.2-1.1l-.6 2.3c-.2.8-.7 1.7-1.1 2.3A10 10 0 1 0 12 2Z",
  },
  {
    id: "instagram",
    label: "Instagram",
    handle: "@zooka_ai_official",
    category: "social",
    status: "pending",
    note: "الحساب قيد مراجعة المنصة ولا يظهر للعامة بعد.",
    path: "M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4Zm0 7.6A3 3 0 1 1 12 9a3 3 0 0 1 0 6Zm5.9-7.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 8.1c-.1-1.4-.4-2.7-1.4-3.7S17.3 3.1 15.9 3c-1.5-.1-6.3-.1-7.8 0-1.4.1-2.7.4-3.7 1.4S3.1 6.7 3 8.1c-.1 1.5-.1 6.3 0 7.8.1 1.4.4 2.7 1.4 3.7s2.3 1.3 3.7 1.4c1.5.1 6.3.1 7.8 0 1.4-.1 2.7-.4 3.7-1.4s1.3-2.3 1.4-3.7c.1-1.5.1-6.3 0-7.8Z",
  },
  {
    id: "telegram",
    label: "Telegram",
    handle: "@zooka_ai_official",
    href: "https://t.me/zooka_ai_official",
    category: "social",
    status: "live",
    path: "M21.9 4.3 19 20c-.2 1-.8 1.2-1.6.8l-4.4-3.3-2.1 2c-.2.2-.4.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.8 13.3 3.4 12c-1-.3-1-1 .2-1.4l17-6.6c.8-.3 1.5.2 1.3 1.3Z",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    handle: "zookaai.bsky.social",
    href: "https://bsky.app/profile/zookaai.bsky.social",
    category: "social",
    status: "live",
    path: "M12 10.8C10.9 8.6 8 4.6 5.3 2.8 2.7 1.1 2 1.6 2 3.9c0 .5.3 4.2.5 4.8.6 2.2 2.7 2.8 4.6 2.5-3.3.6-4.1 2.1-2.3 3.9 1.9 1.9 3.3.5 4.6-1.2.7-1 1.4-2 2.6-2s1.9 1 2.6 2c1.3 1.7 2.7 3.1 4.6 1.2 1.8-1.8 1-3.3-2.3-3.9 1.9.3 4-.3 4.6-2.5.2-.6.5-4.3.5-4.8 0-2.3-.7-2.8-3.3-1.1C16 4.6 13.1 8.6 12 10.8Z",
  },
  {
    id: "github",
    label: "GitHub",
    handle: "ZOOKA-AI",
    href: "https://github.com/ZOOKA-AI",
    category: "developer",
    status: "live",
    path: "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
  },
  {
    id: "repo",
    label: "chatbot repo",
    handle: "ZOOKA-AI/chatbot",
    href: "https://github.com/ZOOKA-AI/chatbot",
    category: "developer",
    status: "live",
    path: "M4 4.5A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v16.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 23V4.5Zm2.5-.5a.5.5 0 0 0-.5.5V18h12V4H6.5Z",
  },
  {
    id: "devto",
    label: "DEV Community",
    handle: "zoka_ai",
    href: "https://dev.to/zoka_ai",
    category: "developer",
    status: "live",
    path: "M2 6h20v12H2V6Zm3.3 3.2v5.6h1.6c1 0 1.6-.6 1.6-1.7V10.9c0-1.1-.6-1.7-1.6-1.7H5.3Zm1.3 1.1h.3c.3 0 .5.2.5.6v2.2c0 .4-.2.6-.5.6h-.3v-3.4Zm4.1-1.1v5.6h2.9v-1.1h-1.6v-1.3h1.4v-1.1h-1.4v-1h1.6V9.2h-2.9Zm4.6 0 1 5.6h1.3l1-5.6h-1.3l-.4 3-.4-3h-1.2Z",
  },
  {
    id: "gdev",
    label: "Google Developer",
    handle: "g.dev/zooka-ai",
    category: "developer",
    status: "pending",
    note: "الملف قيد التجهيز للنشر العام.",
    path: "M21.3 10.9c0-.6-.1-1.1-.2-1.6H12v3.1h5.2c-.2 1.2-1 2.2-2.1 2.9v2.4h3.4c2-1.8 3.1-4.5 3.1-7.7ZM12 22c2.7 0 4.9-.9 6.5-2.4l-3.4-2.4c-.9.6-2 1-3.1 1-2.4 0-4.5-1.6-5.2-3.8H3.3v2.5C4.9 20 8.2 22 12 22ZM6.8 14.4c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V8.1H3.3A10 10 0 0 0 2.3 12.5c0 1.6.4 3 1 4.4l3.5-2.5ZM12 5.9c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 3 14.3 2 12 2 8.2 2 4.9 4 3.3 7.1l3.5 2.5C7.5 7.4 9.6 5.9 12 5.9Z",
  },
  {
    id: "discord",
    label: "Discord",
    handle: "ZOOKA AI",
    href: "https://discord.gg/7ynqJxMZfQ",
    category: "community",
    status: "live",
    path: "M19.3 5.6A16 16 0 0 0 15.4 4l-.3.6a12 12 0 0 1 3.4 1.6 11.6 11.6 0 0 0-9-1.5c-.6.1-1.3.4-2 .7a12 12 0 0 1 3.4-1.6L10.6 4a16 16 0 0 0-3.9 1.6C4 9.4 3.3 13 3.6 16.6a16 16 0 0 0 4.8 2.4l.9-1.4c-.7-.3-1.4-.6-2-1l.5-.3a11.5 11.5 0 0 0 9.8 0l.5.3c-.6.4-1.3.7-2 1l.9 1.4a16 16 0 0 0 4.8-2.4c.4-4.2-.6-7.8-2.5-11ZM9.3 14.4c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Zm5.4 0c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Z",
  },
  {
    id: "reddit",
    label: "Reddit",
    handle: "u/Simple-Suggestion-26",
    href: "https://www.reddit.com/user/Simple-Suggestion-26",
    category: "community",
    status: "live",
    path: "M22 12.2a2.2 2.2 0 0 0-3.7-1.6 10.9 10.9 0 0 0-5.7-1.8l1.2-3.7 3.2.8a1.6 1.6 0 1 0 .2-1.3l-3.8-.9c-.2 0-.4.1-.4.3l-1.4 4.5a10.9 10.9 0 0 0-5.9 1.8 2.2 2.2 0 1 0-2.4 3.6c0 .3-.1.6-.1.9 0 3.1 3.6 5.7 8 5.7s8-2.6 8-5.7c0-.3 0-.6-.1-.9A2.2 2.2 0 0 0 22 12.2ZM8 13.4a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6.9 3.8c-.9.9-2.3 1.3-3.7 1.3s-2.8-.4-3.7-1.3c-.1-.2-.1-.4.1-.5.2-.1.4-.1.5.1.7.7 1.9 1 3.1 1s2.4-.3 3.1-1c.2-.2.4-.2.5-.1.2.1.2.3.1.5Zm-.4-2.3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
  },
  {
    id: "telegram-bot",
    label: "Telegram bot",
    handle: "@zooka_ai_official_bot",
    href: "https://t.me/zooka_ai_official_bot",
    category: "support",
    status: "live",
    path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 6.6-1.7 8c-.1.6-.5.7-1 .4l-2.6-1.9-1.3 1.2c-.1.1-.3.3-.6.3l.2-2.7 4.9-4.4c.2-.2-.1-.3-.4-.1l-6 3.8-2.6-.8c-.6-.2-.6-.6.1-.9l10.1-3.9c.5-.2.9.1.9.7Z",
  },
];

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
