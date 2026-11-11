"use client";

import { useState } from "react";

const ACTIONS = [
  { type: "IMAGE", label: "صورة" },
  { type: "VIDEO", label: "فيديو" },
  { type: "MAP_3D", label: "خريطة 3D" },
  { type: "CARTOON", label: "قصة كرتونية" },
] as const;

export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPromptEmpty = prompt.trim().length === 0;

  async function submit(actionType: string) {
    if (isPromptEmpty) {
      return;
    }
    setLoading(actionType);
    setError(null);
    try {
      const response = await fetch("/api/media-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, prompt }),
      });
      const data: unknown = await response.json().catch(() => null);
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : null;
      if (!response.ok) {
        setError(message ?? "تعذّر تنفيذ الطلب");
      }
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8" dir="rtl">
      <h1 className="font-semibold text-2xl">استوديو الوسائط</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        واجهة الطلب جاهزة، والتوليد الفعلي بانتظار ربط مزود خارجي.
      </p>

      <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 text-xs dark:text-amber-300">
        تنبيه: التوليد غير مفعّل حاليًا. الخادم يرفض الطلب صراحةً ولا يخصم أي حصة.
      </div>

      <div className="mt-6">
        <label className="mb-2 block font-medium text-sm" htmlFor="studio-prompt">
          وصف المشهد المطلوب
        </label>
        <textarea
          className="w-full rounded-xl border bg-transparent p-3 text-sm outline-none focus:border-foreground/40"
          id="studio-prompt"
          onChange={(event) => {
            setPrompt(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          rows={3}
          value={prompt}
        />
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-700 text-sm dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {ACTIONS.map((action) => (
          <button
            className="rounded-xl border px-3 py-3 font-medium text-sm transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isPromptEmpty || loading !== null}
            key={action.type}
            onClick={() => submit(action.type)}
            type="button"
          >
            {loading === action.type ? "جارٍ التحقق…" : action.label}
          </button>
        ))}
      </div>
    </main>
  );
}
