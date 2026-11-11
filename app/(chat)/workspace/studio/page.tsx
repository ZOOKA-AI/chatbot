"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ACTIONS = [
  { type: "IMAGE", label: "صورة" },
  { type: "VIDEO", label: "فيديو" },
  { type: "MAP_3D", label: "خريطة 3D" },
  { type: "CARTOON", label: "قصة كرتونية" },
] as const;

type Job = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  assetUrl: string | null;
  error: string | null;
  actionType: string;
};

export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPromptEmpty = prompt.trim().length === 0;

  const poll = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/media-engine?jobId=${jobId}`);
    const data = (await response.json().catch(() => null)) as Job | null;
    if (!response.ok || !data) {
      setError("تعذّر قراءة حالة الطلب");
      return;
    }
    setJob(data);
    if (data.status === "queued" || data.status === "running") {
      timer.current = setTimeout(() => poll(jobId), 4000);
    }
  }, []);

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  async function submit(actionType: string) {
    if (isPromptEmpty || submitting) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    setSubmitting(actionType);
    setError(null);
    setJob(null);
    try {
      const response = await fetch("/api/media-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, prompt }),
      });
      const data = (await response.json().catch(() => null)) as
        | { jobId?: string; error?: string }
        | null;
      if (!response.ok || !data?.jobId) {
        setError(data?.error ?? "تعذّر تنفيذ الطلب");
        return;
      }
      setJob({
        jobId: data.jobId,
        status: "queued",
        assetUrl: null,
        error: null,
        actionType,
      });
      poll(data.jobId);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setSubmitting(null);
    }
  }

  const busy = job?.status === "queued" || job?.status === "running";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8" dir="rtl">
      <h1 className="font-semibold text-2xl">استوديو الوسائط</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        أرسل الوصف، وسيُعاد إليك رابط المحتوى فور انتهاء المعالجة.
      </p>

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
            disabled={isPromptEmpty || submitting !== null || busy}
            key={action.type}
            onClick={() => submit(action.type)}
            type="button"
          >
            {submitting === action.type ? "جارٍ الإرسال…" : action.label}
          </button>
        ))}
      </div>

      {job ? (
        <section className="mt-6 rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">
            حالة الطلب: {job.status === "queued" ? "في الانتظار" : null}
            {job.status === "running" ? "قيد المعالجة" : null}
            {job.status === "succeeded" ? "تم" : null}
            {job.status === "failed" ? "فشل" : null}
          </p>

          {job.error ? (
            <p className="mt-2 text-red-700 text-sm dark:text-red-300">{job.error}</p>
          ) : null}

          {job.assetUrl ? (
            <div className="mt-3">
              {job.actionType === "VIDEO" ? (
                <video
                  className="w-full rounded-lg"
                  controls
                  playsInline
                  src={job.assetUrl}
                />
              ) : (
                // biome-ignore lint/performance/noImgElement: remote generated asset
                <img
                  alt="المحتوى المولّد"
                  className="w-full rounded-lg"
                  src={job.assetUrl}
                />
              )}
              <p className="mt-2 break-all font-mono text-muted-foreground text-xs">
                {job.assetUrl}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
