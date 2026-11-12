"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";

type Turn = { role: "user" | "assistant"; content: string };

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
            : "تعذر الوصول للوكيل الآن. جرّب بعد قليل."
        );
        return;
      }

      setTurns((prev) => [...prev, { role: "assistant", content: data.reply as string }]);
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
        {turns.map((turn, index) => (
          <div
            className={
              turn.role === "user"
                ? "ms-auto max-w-[85%] whitespace-pre-wrap rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "me-auto max-w-[85%] whitespace-pre-wrap rounded-xl border bg-card px-3 py-2 text-sm"
            }
            key={`${turn.role}-${index}`}
          >
            {turn.content}
          </div>
        ))}
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
