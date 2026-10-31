"use client";

import { Check, ChevronDown, Chrome, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

type StepState = "running" | "done" | "error";

type Step = {
  id: string;
  label: string;
  detail: string;
  state: StepState;
};

const TOOL_LABELS: Record<string, { ar: string; en: string }> = {
  searchWeb: { ar: "بحث في الويب", en: "Searching the web" },
  readUrl: { ar: "قراءة صفحة ويب", en: "Reading a web page" },
  searchGoogleDrive: { ar: "بحث في Google Drive", en: "Searching Google Drive" },
  readGoogleDriveFile: { ar: "قراءة ملف من Drive", en: "Reading a Drive file" },
  searchGmail: { ar: "بحث في Gmail", en: "Searching Gmail" },
  readGmailMessage: { ar: "قراءة رسالة بريد", en: "Reading an email" },
  sendGmailMessage: { ar: "إرسال بريد إلكتروني", en: "Sending an email" },
  createDocument: { ar: "إنشاء مستند", en: "Creating a document" },
  updateDocument: { ar: "تحديث مستند", en: "Updating a document" },
  requestSuggestions: { ar: "اقتراح تحسينات", en: "Drafting suggestions" },
  runN8nWorkflow: { ar: "تشغيل workflow في n8n", en: "Running an n8n workflow" },
  getWeather: { ar: "جلب حالة الطقس", en: "Checking the weather" },
};

function humanizeToolName(name: string) {
  return name
    .replace(/^tool-/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function describeInput(input: unknown) {
  if (!input || typeof input !== "object") {
    return "";
  }
  const record = input as Record<string, unknown>;
  const preferred = ["query", "q", "url", "fileName", "name", "title", "to"];
  for (const key of preferred) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 90);
    }
  }
  const firstString = Object.values(record).find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
  return firstString ? firstString.trim().slice(0, 90) : "";
}

function collectSteps(
  messages: ChatMessage[],
  lang: "ar" | "en"
): { steps: Step[]; currentText: string } {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!lastAssistant?.parts) {
    return { steps: [], currentText: "" };
  }

  const steps: Step[] = [];
  let currentText = "";
  let index = 0;

  for (const part of lastAssistant.parts as {
    type: string;
    state?: string;
    input?: unknown;
    text?: string;
    name?: string;
    toolName?: string;
  }[]) {
    if (part.type === "text" && typeof part.text === "string") {
      const trimmed = part.text.trim();
      if (trimmed) {
        currentText = trimmed;
      }
      continue;
    }

    const isTool =
      part.type.startsWith("tool-") || part.type === "dynamic-tool";
    if (!isTool) {
      continue;
    }

    const toolName =
      part.name ??
      part.toolName ??
      (part.type === "dynamic-tool" ? "tool" : part.type.replace("tool-", ""));
    const labels = TOOL_LABELS[toolName];
    const label = labels
      ? labels[lang]
      : lang === "ar"
        ? humanizeToolName(toolName)
        : humanizeToolName(toolName);
    const state: StepState =
      part.state === "output-error"
        ? "error"
        : part.state === "output-available"
          ? "done"
          : "running";

    index += 1;
    steps.push({
      id: `${toolName}-${index}`,
      label,
      detail: describeInput(part.input),
      state,
    });
  }

  return { steps, currentText };
}

export function AgentActivity({
  messages,
  status,
  lang,
}: {
  messages: ChatMessage[];
  status: string;
  lang: "ar" | "en";
}) {
  const isArabic = lang === "ar";
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const active = status === "submitted" || status === "streaming";

  const { steps, currentText } = useMemo(
    () => collectSteps(messages, lang),
    [messages, lang]
  );

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) {
      setOpen(false);
    }
  }, [active]);

  if (!active) {
    return null;
  }

  const doneCount = steps.filter((step) => step.state === "done").length;
  const runningStep = [...steps].reverse().find((step) => step.state === "running");

  return (
    <div
      className="fixed right-3 bottom-28 z-50 flex flex-col items-end gap-2 sm:right-5"
      data-testid="agent-activity"
    >
      {open ? (
        <div className="w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-medium">
              <Chrome className="size-4 text-primary" />
              {isArabic ? "متصفح الوكيل" : "Agent browser"}
            </span>
            <button
              aria-label={isArabic ? "تصغير" : "Collapse"}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
              type="button"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto px-3 py-2">
            {steps.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {isArabic ? "جارٍ فهم الطلب..." : "Understanding the request..."}
              </p>
            ) : (
              steps.map((step) => (
                <div className="flex items-start gap-2" key={step.id}>
                  <span className="mt-0.5">
                    {step.state === "done" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : step.state === "error" ? (
                      <TriangleAlert className="size-3.5 text-amber-600" />
                    ) : (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    )}
                  </span>
                  <span className="min-w-0 grow">
                    <span className="block text-xs font-medium">
                      {step.label}
                    </span>
                    {step.detail ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {step.detail}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
            {currentText ? (
              <p className="border-border border-t pt-2 text-[11px] text-muted-foreground">
                {currentText.slice(0, 220)}
                {currentText.length > 220 ? "…" : ""}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-border border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              {isArabic
                ? `${doneCount} خطوة مكتملة · ${elapsed}ث`
                : `${doneCount} steps done · ${elapsed}s`}
            </span>
            <span>
              {runningStep
                ? isArabic
                  ? "يعمل الآن"
                  : "working"
                : isArabic
                  ? "يكتب الرد"
                  : "writing the answer"}
            </span>
          </div>
        </div>
      ) : null}

      <button
        aria-label={
          isArabic ? "متابعة عمل الوكيل" : "Follow the agent's work"
        }
        className={cn(
          "relative flex size-11 items-center justify-center rounded-full border border-border bg-background text-primary shadow-lg transition-transform hover:scale-105"
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Chrome className="size-5" />
        <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center">
          <span className="absolute inline-flex size-3.5 animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        {steps.length > 0 ? (
          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {steps.length}
          </span>
        ) : null}
      </button>
    </div>
  );
}
