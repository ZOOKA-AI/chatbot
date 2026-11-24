"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Response } from "@/components/elements/response";

type Source = { title: string; url: string };
type Turn = { role: "user" | "assistant"; content: string; sources?: Source[] };

type Props = {
  plan: string;
  used: number;
  limit: number;
};

export function AgentConsole({ plan, used, limit }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [usedNow, setUsedNow] = useState(used);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, pending]);

  async function send() {
    const message = input.trim();
    if (!message || pending) {
      return;
    }
    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setPending(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        sources?: Source[];
        error?: string;
        used?: number;
        limit?: number;
        plan?: string;
      };

      if (response.status === 429) {
        setError(
          `وصلت لحد خطتك (${data.limit ?? limit} تشغيل شهريًا). رقِّ الخطة لتكمل.`
        );
        return;
      }
      if (!response.ok || !data.reply) {
        setError(
          response.status === 401
            ? "انتهت الجلسة. سجّل الدخول من جديد."
            : data.error === "agent_not_configured"
              ? "الوكيل التنفيذي غير مفعّل بعد على هذه المنصة. استخدم «الوكيل» داخل الشات حتى يتم تفعيله."
              : "تعذر الوصول للوكيل الآن. جرّب بعد قليل."
        );
        return;
      }

      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply as string,
          sources: Array.isArray(data.sources) ? data.sources.slice(0, 5) : [],
        },
      ]);
      if (typeof data.used === "number") {
        setUsedNow(data.used);
      }
    } catch {
      setError("تعذر الاتصال. تحقّق من الشبكة وجرّب مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div>
          <p className="text-sm text-muted-foreground">الوكيل التنفيذي</p>
          <p className="text-lg font-semibold">
            {usedNow} / {limit} تشغيل — خطة {plan}
          </p>
        </div>
        <Link
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
          href="/workspace/billing"
        >
          إدارة الخطة
        </Link>
      </div>

      <div
        ref={scroller}
        className="min-h-[320px] flex-1 space-y-3 overflow-y-auto rounded-xl border p-4"
      >
        {turns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            اكتب مهمتك: «لخّص آخر رسائل العملاء»، «جهّز خطة محتوى الأسبوع»، أو «ابحث عن
            منافس في الشارقة».
          </p>
        ) : null}
        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div
              className="ms-auto max-w-[85%] whitespace-pre-wrap rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
              key={`${turn.role}-${index}`}
            >
              {turn.content}
            </div>
          ) : (
            <div
              className="me-auto max-w-[85%] rounded-xl border bg-card px-3 py-2 text-sm"
              data-testid="agent-reply"
              key={`${turn.role}-${index}`}
            >
              <Response>{turn.content}</Response>
              {turn.sources && turn.sources.length > 0 ? (
                <ol className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
                  {turn.sources.map((source, sourceIndex) => (
                    <li key={source.url}>
                      [{sourceIndex + 1}]{" "}
                      <a
                        className="underline hover:text-foreground"
                        href={source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          )
        )}
        {pending ? (
          <p className="me-auto rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground">
            الوكيل يعمل…
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="اكتب رسالتك… (Enter للإرسال)"
          rows={1}
          value={input}
        />
        <button
          className="rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={pending || !input.trim()}
          onClick={send}
          type="button"
        >
          إرسال
        </button>
      </div>
    </div>
  );
}
