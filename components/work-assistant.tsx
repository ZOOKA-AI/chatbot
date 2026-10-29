"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getWorkAssistantProgress } from "@/lib/ai/work-assistant-progress";
import type { ChatMessage } from "@/lib/types";

const presets = {
  en: [
    {
      title: "Research a topic",
      description: "Summarize findings and cite the sources used.",
      prompt:
        "Research this topic using available sources: [topic]. Summarize the key findings, cite the sources returned by tools, and say clearly if evidence is missing.",
    },
    {
      title: "Plan a project",
      description: "Turn a goal into practical next steps.",
      prompt:
        "Create a practical project plan for this goal: [goal]. Separate confirmed information from assumptions and list any questions that need my input.",
    },
    {
      title: "Review text",
      description: "Find key points, gaps, and suggested edits.",
      prompt:
        "Review the text I provide for clarity and action items. Point out gaps without inventing missing information.",
    },
  ],
  ar: [
    {
      title: "ابحث عن موضوع",
      description: "لخّص النتائج واذكر المصادر المستخدمة.",
      prompt:
        "ابحث عن هذا الموضوع باستخدام المصادر المتاحة: [الموضوع]. لخّص النتائج الأساسية، واذكر المصادر التي أعادتها الأدوات، ووضّح عند غياب الأدلة.",
    },
    {
      title: "خطّط لمشروع",
      description: "حوّل الهدف إلى خطوات عملية.",
      prompt:
        "أنشئ خطة عملية لهذا الهدف: [الهدف]. ميّز المعلومات المؤكدة عن الافتراضات، واذكر الأسئلة التي تحتاج إلى إجابتي.",
    },
    {
      title: "راجع نصاً",
      description: "استخرج النقاط والفجوات والتعديلات المقترحة.",
      prompt:
        "راجع النص الذي سأرسله من حيث الوضوح وعناصر العمل. اذكر الفجوات دون اختلاق معلومات غير موجودة.",
    },
  ],
} as const;

export function WorkAssistantOverview({
  canUseAgentMode,
  agentModeEnabled,
  lang,
  onSelectPrompt,
}: {
  canUseAgentMode: boolean;
  agentModeEnabled: boolean;
  lang: "ar" | "en";
  onSelectPrompt: (prompt: string) => void;
}) {
  const isArabic = lang === "ar";

  return (
    <section
      aria-label={isArabic ? "مساعد العمل" : "Work assistant"}
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-xl border p-5 md:p-6"
      data-testid="work-assistant-overview"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div>
        <h1 className="font-semibold text-xl">
          {isArabic ? "ابدأ بمهمة" : "Start with a task"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isArabic
            ? "اختر نقطة بداية أو اكتب طلبك. ستظهر نتائج الأدوات والمصادر الفعلية في المحادثة."
            : "Choose a starting point or write your own request. Actual tool results and sources appear in the conversation."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {presets[lang].map((preset, index) => (
          <Button
            className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-start"
            data-testid={`work-assistant-preset-${index}`}
            disabled={!canUseAgentMode || !agentModeEnabled}
            key={preset.title}
            onClick={() => onSelectPrompt(preset.prompt)}
            type="button"
            variant="outline"
          >
            <span className="font-medium">{preset.title}</span>
            <span className="text-muted-foreground text-xs">
              {preset.description}
            </span>
          </Button>
        ))}
      </div>
      {!canUseAgentMode && (
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? "يتطلب مساعد العمل خطة Pro أو Business مع رصيد تشغيل متاح."
            : "The work assistant requires a Pro or Business plan with an available run."}{" "}
          <Link className="underline" href="/workspace/billing">
            {isArabic ? "عرض الباقة والاستخدام" : "View plan and usage"}
          </Link>
        </p>
      )}
      {canUseAgentMode && !agentModeEnabled && (
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? "فعّل وضع الوكيل واختر نموذجاً يدعم الأدوات لاستخدام مهام مساعد العمل."
            : "Enable Agent mode and choose a tool-capable model to use work presets."}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {isArabic ? "تحتاج إلى ملفات مساحة العمل؟" : "Need workspace files?"}{" "}
        <Link className="underline" href="/settings/integrations">
          {isArabic ? "تحقق من التكاملات" : "Check integrations"}
        </Link>
      </p>
    </section>
  );
}

export function WorkAssistantProgress({
  messages,
  status,
  stopped,
  lang,
}: {
  messages: ChatMessage[];
  status: UseChatHelpers<ChatMessage>["status"];
  stopped?: boolean;
  lang: "ar" | "en";
}) {
  return (
    <output
      aria-live="polite"
      className="mx-auto w-full max-w-3xl rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      data-testid="work-assistant-progress"
    >
      {getWorkAssistantProgress({ lang, messages, status, stopped })}
    </output>
  );
}
