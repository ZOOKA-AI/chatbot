"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { isTerminalStage, pollDelayMs } from "@/lib/agents/execution-stage";
import type { TaskDetail } from "@/lib/agents/task-detail";

/**
 * The same truth as the Commander panel, in one line inside the conversation.
 *
 * The sentence comes from the server (`line`), which builds it from the derived view, so
 * the chat cannot drift from the task page. While the task is live this polls; once it is
 * terminal it stops, and says so.
 */

export function ExecutionProgressCard({ taskId, lang }: { taskId: string; lang?: "ar" | "en" }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [resolvedLang, setResolvedLang] = useState<"ar" | "en">(lang ?? "en");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lang) return;
    const tag = document.documentElement.lang?.toLowerCase() ?? "";
    if (tag.startsWith("ar")) setResolvedLang("ar");
  }, [lang]);

  const t = resolvedLang;

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch(`/api/agents/tasks/${taskId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as TaskDetail;
        if (cancelled) return;
        setDetail(body);
        setFailed(false);
        const delay = pollDelayMs(body.progress.stage);
        if (delay !== null) timer.current = setTimeout(tick, delay);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [taskId]);

  if (failed) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        {t === "ar" ? "تعذّر قراءة حالة المهمة." : "Could not read the task state."}
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        {t === "ar" ? "جارٍ قراءة حالة المهمة…" : "Reading the task state…"}
      </div>
    );
  }

  const live = !isTerminalStage(detail.progress.stage);

  return (
    <div className="flex flex-col gap-1 rounded-md border p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={detail.progress.stage === "failed" ? "destructive" : "secondary"}>{detail.progress.stage}</Badge>
        <span>{detail.line}</span>
        {live ? <span className="text-muted-foreground">{t === "ar" ? "(يُحدَّث)" : "(live)"}</span> : null}
      </div>
      <a className="text-[11px] text-muted-foreground underline" href={`/workspace/commander?task=${taskId}`}>
        {t === "ar" ? "التفاصيل والدليل في مركز القيادة" : "Details and evidence in Commander"}
      </a>
    </div>
  );
}
