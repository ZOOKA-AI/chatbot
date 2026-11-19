"use client";

import { useCallback, useEffect, useState } from "react";

import { LiveBrowser } from "@/components/live-browser";

/**
 * The browser, one tap away from the agent chat.
 *
 * A floating control that opens the live browser over the conversation and disappears while it is
 * open, so the panel owns the screen it needs and the chat keeps its own space. The open state is
 * remembered per browser, and the panel is mounted only when open: no background fetches, no
 * address checks running behind a closed panel.
 */
const STORAGE_KEY = "zooka.agent.browser.open";

export function AgentBrowserDock({ initialUrl = "https://zooka-ai.com" }: { initialUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setOpen(false);
    }
    setReady(true);
  }, []);

  const toggle = useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage is a preference, never a requirement */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  if (!ready) return null;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col rounded-2xl bg-[#070d18]/95 p-2 shadow-2xl backdrop-blur"
          role="dialog"
          aria-modal="false"
          aria-label="المتصفح المباشر"
          id="agent-browser-panel"
        >
          <div className="min-h-0 flex-1">
            <LiveBrowser initialUrl={initialUrl} fillHeight onClose={() => toggle(false)} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggle(true)}
          aria-expanded={false}
          aria-controls="agent-browser-panel"
          className="fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white shadow-xl transition hover:brightness-110"
          style={{ background: "linear-gradient(135deg, #2E86AB, #A23B72)" }}
        >
          <span aria-hidden>🌐</span>
          المتصفح
        </button>
      )}
    </>
  );
}
