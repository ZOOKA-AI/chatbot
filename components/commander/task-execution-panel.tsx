"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isTerminalStage, pollDelayMs, type ExecutionStage } from "@/lib/agents/execution-stage";
import type { TaskDetail } from "@/lib/agents/task-detail";

/**
 * What actually happened to a task, read from the API that reads the database.
 *
 * Two things this component refuses to do, because the mockups of this screen did both:
 * invent a percentage, and render a status without saying what proves it. There is no
 * progress bar: the platform knows stages and evidence, not fractions of work.
 */

type Lang = "ar" | "en";

const COPY = {
  ar: {
    stage: "مرحلة التنفيذ",
    attempts: "المحاولات",
    evidence: "الدليل",
    noEvidence: "لا يوجد دليل مسجَّل لهذه المهمة.",
    evidenceVerified: "الدليل مسجَّل ومُتحقَّق منه من قاعدة البيانات.",
    tool: "الأداة",
    reference: "مرجع الدليل",
    started: "بدأت",
    duration: "المدة",
    error: "الخطأ",
    retry: "إعادة المحاولة",
    cancel: "إلغاء المهمة",
    loading: "جارٍ قراءة حالة المهمة…",
    failedToLoad: "تعذّر قراءة حالة المهمة.",
    confirmRetry: "سيُعاد فتح المهمة كمحاولة جديدة. المتابعة؟",
    confirmCancel: "سيتم إلغاء المهمة. المتابعة؟",
    next: "الخطوة التالية",
    noNext: "لا شيء مطلوب منك الآن.",
  },
  en: {
    stage: "Execution stage",
    attempts: "Attempts",
    evidence: "Evidence",
    noEvidence: "No evidence was recorded for this task.",
    evidenceVerified: "Evidence is recorded and read back from the database.",
    tool: "Tool",
    reference: "Evidence reference",
    started: "Started",
    duration: "Duration",
    error: "Error",
    retry: "Retry",
    cancel: "Cancel task",
    loading: "Reading the task state…",
    failedToLoad: "Could not read the task state.",
    confirmRetry: "This reopens the task as a new attempt. Continue?",
    confirmCancel: "This cancels the task. Continue?",
    next: "Next step",
    noNext: "Nothing is required from you right now.",
  },
} as const;

function tone(stage: ExecutionStage): "default" | "secondary" | "destructive" | "outline" {
  if (stage === "completed") return "default";
  if (stage === "failed" || stage === "blocked") return "destructive";
  if (stage === "running" || stage === "queued") return "secondary";
  return "outline";
}

function formatMs(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 1000) return `${value} ms`;
  const seconds = Math.round(value / 100) / 10;
  return `${seconds} s`;
}

export function TaskExecutionPanel({
  taskId,
  lang,
  canManage,
  onChanged,
}: {
  taskId: string;
  lang: Lang;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const copy = COPY[lang];
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<null | "retry" | "cancel">(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/agents/tasks/${taskId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as TaskDetail;
      setDetail(body);
      setState("ready");
      return body;
    } catch {
      setState((current) => (current === "ready" ? "ready" : "error"));
      return null;
    }
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const body = await load();
      if (cancelled) return;
      const delay = body ? pollDelayMs(body.progress.stage) : 8000;
      // A terminal stage stops the loop; a stalled one slows down but keeps asking,
      // because the scheduler is expected to reclaim it.
      if (delay !== null) timer.current = setTimeout(tick, delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const act = async (kind: "retry" | "cancel") => {
    if (!detail) return;
    const confirmed = window.confirm(kind === "retry" ? copy.confirmRetry : copy.confirmCancel);
    if (!confirmed) return;

    setBusy(kind);
    setMessage(null);
    try {
      const path = kind === "retry" ? `/api/agents/tasks/${taskId}/retry` : `/api/agents/tasks/${taskId}`;
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: kind === "retry" ? "retry_from_task_panel" : "cancel_from_task_panel" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        // The API's own word for why, never a friendlier invented one.
        setMessage(body.error ?? `HTTP ${response.status}`);
        return;
      }
      await load();
      onChanged?.();
    } catch {
      setMessage("network_error");
    } finally {
      setBusy(null);
    }
  };

  if (state === "loading") {
    return <p className="text-sm text-muted-foreground">{copy.loading}</p>;
  }
  if (state === "error" || !detail) {
    return <p className="text-sm text-destructive">{copy.failedToLoad}</p>;
  }

  const { progress, evidence, timing, task } = detail;
  const duration = formatMs(timing.durationMs);
  const terminal = isTerminalStage(progress.stage);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone(progress.stage)}>{progress.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {copy.attempts}: {task.attempts}/{task.maxAttempts}
        </span>
        {terminal ? null : <span className="text-xs text-muted-foreground">·</span>}
      </div>

      <div className="text-sm">
        <p className="font-medium">{copy.next}</p>
        <p className="text-muted-foreground">{progress.hint ?? copy.noNext}</p>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">{copy.started}</dt>
          <dd className="text-muted-foreground">{timing.startedAt ? new Date(timing.startedAt).toISOString() : "—"}</dd>
        </div>
        <div>
          <dt className="font-medium">{copy.duration}</dt>
          <dd className="text-muted-foreground">{duration ?? "—"}</dd>
        </div>
      </dl>

      <div className="text-sm">
        <p className="font-medium">{copy.evidence}</p>
        {evidence.present ? (
          <>
            <p className="text-muted-foreground">{copy.evidenceVerified}</p>
            <ul className="mt-1 flex flex-col gap-1 text-muted-foreground">
              {evidence.tool ? (
                <li>
                  {copy.tool}: <span className="font-mono text-xs">{evidence.tool}</span>
                </li>
              ) : null}
              {evidence.reference ? (
                <li>
                  {copy.reference}: <span className="font-mono text-xs">{evidence.reference}</span>
                </li>
              ) : null}
            </ul>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
              {JSON.stringify(evidence.summary, null, 2)}
            </pre>
          </>
        ) : (
          <p className="text-muted-foreground">{copy.noEvidence}</p>
        )}
      </div>

      {detail.error ? (
        <div className="text-sm">
          <p className="font-medium text-destructive">{copy.error}</p>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2">{detail.error}</p>
        </div>
      ) : null}

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      {canManage && (progress.canRetry || progress.canCancel) ? (
        <div className="flex flex-wrap gap-2">
          {progress.canRetry ? (
            <Button size="sm" variant="outline" onClick={() => act("retry")} disabled={busy !== null}>
              {copy.retry}
            </Button>
          ) : null}
          {progress.canCancel ? (
            <Button size="sm" variant="destructive" onClick={() => act("cancel")} disabled={busy !== null}>
              {copy.cancel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!progress.canRetry && progress.retryReason ? (
        <p className="text-xs text-muted-foreground">{progress.retryReason}</p>
      ) : null}
    </div>
  );
}
