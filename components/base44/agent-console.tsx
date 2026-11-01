"use client";

import { useState } from "react";

type Turn = { role: "user" | "agent"; text: string; credits?: number };

export function AgentConsole({
  canUseAgent,
  plan,
}: {
  canUseAgent: boolean;
  plan: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState<number | null>(null);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    setBusy(true);
    setError(null);
    setTurns((current) => [...current, { role: "user", text: message }]);
    setInput("");

    try {
      const response = await fetch("/api/base44/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error === "plan_required"
            ? "الوكيل متاح في خطة Pro و Business."
            : data.error === "quota_exhausted"
              ? "انتهت حصة الرسائل في خطتك لهذا الشهر."
              : "تعذر الوصول إلى الوكيل الآن."
        );
        return;
      }

      setTurns((current) => [
        ...current,
        {
          role: "agent",
          text: data.reply || "…",
          credits: data.usage?.creditsCharged ?? 0,
        },
      ]);
      setSpent(data.metering?.credits ?? null);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span>الخطة: {plan}</span>
        {spent !== null ? <span>استهلاكك هذا الشهر: {spent} كريدت</span> : null}
        <span>{canUseAgent ? "الوكيل مفعّل" : "الوكيل يتطلب ترقية"}</span>
      </div>

      <div className="border-border flex min-h-64 flex-col gap-3 rounded-lg border p-4">
        {turns.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            اكتب مهمتك وسينفذها وكيل Base44 ويُحسب استهلاكك حسب الاستخدام.
          </p>
        ) : null}
        {turns.map((turn, index) => (
          <div
            className={
              turn.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm"
                : "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm"
            }
            key={`${turn.role}-${index}`}
          >
            <p className="whitespace-pre-wrap">{turn.text}</p>
            {typeof turn.credits === "number" ? (
              <p className="text-muted-foreground mt-1 text-[11px]">
                استهلاك هذه الرسالة: {turn.credits} كريدت
              </p>
            ) : null}
          </div>
        ))}
        {busy ? (
          <p className="text-muted-foreground text-sm">الوكيل يعمل…</p>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
          onChange={(event) => setInput(event.target.value)}
          placeholder="مثال: لخص لي أداء مبيعات الأسبوع"
          value={input}
        />
        <button
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
          disabled={busy || !input.trim()}
          type="submit"
        >
          إرسال
        </button>
      </form>
    </section>
  );
}
