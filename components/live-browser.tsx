"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The browser panel.
 *
 * A real page rendered live inside the app, wrapped in the chrome a browser has: back, forward,
 * reload, an address bar that shows the real host and a lock when the connection is https. The frame
 * is the customer's own browser showing the page, so the page is genuinely interactive.
 *
 * Honesty rules kept from the rest of the workspace: a site that refuses to be framed is named as
 * such with the header that refused it, never hidden behind a blank frame; a navigation that fails
 * shows the reason the server gave; and the panel never claims to be a browser we control when it is
 * the customer's own.
 */

type Verdict = {
  embeddable: boolean;
  reason:
    | "allowed"
    | "x_frame_options"
    | "frame_ancestors"
    | "unreachable"
    | "unsafe_url";
  finalUrl: string | null;
  detail: string | null;
};

const REFUSAL_TEXT: Record<Verdict["reason"], string> = {
  allowed: "",
  x_frame_options:
    "الموقع يمنع عرضه داخل إطار (X-Frame-Options)، فلا يمكن عرضه هنا.",
  frame_ancestors:
    "سياسة المحتوى للموقع (frame-ancestors) تمنع إطاره داخل تطبيق آخر.",
  unreachable: "تعذّر الوصول إلى الموقع من الخادم الآن، فلم أستطع فحصه.",
  unsafe_url: "العنوان مرفوض: المسموح هو http و https لعناوين عامة فقط.",
};

function normalise(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function LiveBrowser({
  initialUrl = "https://zooka-ai.com",
}: {
  initialUrl?: string;
}) {
  const [address, setAddress] = useState(initialUrl);
  const [target, setTarget] = useState(initialUrl);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [cursor, setCursor] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const probe = useCallback(async (url: string) => {
    setChecking(true);
    try {
      const response = await fetch(
        `/api/workspace/browser/embed-check?url=${encodeURIComponent(url)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setVerdict({
          embeddable: false,
          reason: "unreachable",
          finalUrl: null,
          detail: `http_${response.status}`,
        });
        return;
      }
      setVerdict((await response.json()) as Verdict);
    } catch {
      setVerdict({
        embeddable: false,
        reason: "unreachable",
        finalUrl: null,
        detail: "network",
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void probe(target);
  }, [target, probe]);

  const go = useCallback(
    (raw: string) => {
      const url = normalise(raw);
      if (!url) return;
      setAddress(url);
      setTarget(url);
      const next = [...history.slice(0, cursor + 1), url];
      setHistory(next);
      setCursor(next.length - 1);
      setReloadKey((value) => value + 1);
    },
    [cursor, history],
  );

  const step = useCallback(
    (delta: number) => {
      const index = cursor + delta;
      const url = history[index];
      if (!url) return;
      setCursor(index);
      setAddress(url);
      setTarget(url);
      setReloadKey((value) => value + 1);
    },
    [cursor, history],
  );

  const https = target.startsWith("https://");
  const host = (() => {
    try {
      return new URL(target).host;
    } catch {
      return target;
    }
  })();

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" aria-hidden />
          <span className="size-3 rounded-full bg-[#febc2e]" aria-hidden />
          <span className="size-3 rounded-full bg-[#28c840]" aria-hidden />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={cursor === 0}
            aria-label="رجوع"
            className="rounded-md px-2 py-1 text-lg leading-none text-white/80 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={cursor >= history.length - 1}
            aria-label="تقدّم"
            className="rounded-md px-2 py-1 text-lg leading-none text-white/80 disabled:opacity-30"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            aria-label="إعادة تحميل"
            className="rounded-md px-2 py-1 text-sm text-white/80"
          >
            ⟳
          </button>
        </div>
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            go(address);
          }}
        >
          <span className="text-xs" aria-hidden>
            {https ? "🔒" : "⚠️"}
          </span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            dir="ltr"
            spellCheck={false}
            aria-label="عنوان الموقع"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
            placeholder="zooka-ai.com"
          />
        </form>
        <a
          href={target}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="فتح في نافذة جديدة"
          className="rounded-md px-2 py-1 text-sm text-white/80"
        >
          ↗
        </a>
      </div>

      <div className="relative flex-1 bg-white">
        {checking ? (
          <div className="flex h-full items-center justify-center bg-[#0b1220] text-sm text-white/70">
            يجري فحص إمكانية عرض {host}…
          </div>
        ) : verdict?.embeddable ? (
          <iframe
            key={`${target}#${reloadKey}`}
            ref={frameRef}
            src={target}
            title={`متصفح — ${host}`}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0b1220] px-6 text-center">
            <p className="text-sm text-white/80">
              {REFUSAL_TEXT[verdict?.reason ?? "unreachable"]}
            </p>
            {verdict?.detail ? (
              <p dir="ltr" className="font-mono text-[11px] text-white/40">
                {verdict.detail}
              </p>
            ) : null}
            <p className="max-w-md text-xs text-white/50">
              العرض المباشر يتم داخل متصفحك أنت. المواقع التي تمنع الإطار تُفتح
              في نافذة مستقلة، أو تُعرض لقطات من متصفح يعمل على الخادم عند
              تفعيله.
            </p>
            <a
              href={target}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              افتح {host} في نافذة جديدة
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-4 py-1.5 text-[11px] text-white/50">
        <span dir="ltr">{host}</span>
        <span>
          {verdict?.embeddable
            ? "عرض مباشر داخل التطبيق"
            : "غير معروض داخل الإطار"}
        </span>
      </div>
    </div>
  );
}
