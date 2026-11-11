"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { motion } from "framer-motion";
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


const buildPresets = {
  en: [
    {
      title: "Create a website",
      description: "Landing page, services, pricing and contact in one go.",
      prompt:
        "Build a website for this business: [business name and services]. Include a hero section, services with prices, an about section, and a contact section with WhatsApp and phone. Tell me the exact files and steps, and mark anything I must fill in.",
    },
    {
      title: "Create an app",
      description: "Turn a repeated manual task into a small internal app.",
      prompt:
        "Build a small internal app for this process: [describe the process]. Define the data fields, the screens, and the actions, and list the assumptions you had to make.",
    },
    {
      title: "Ready templates",
      description: "Pick a prepared starting point and adjust it.",
      prompt:
        "Show me the ready templates available for this business type and recommend one, with the reasons for the choice.",
    },
  ],
  ar: [
    {
      title: "أنشئ موقعًا",
      description: "صفحة هبوط وخدمات وأسعار وتواصل في خطوة واحدة.",
      prompt:
        "أنشئ موقعًا لهذا النشاط: [اسم النشاط والخدمات]. ضمّن قسمًا رئيسيًا، والخدمات مع الأسعار، وقسمًا عن الشركة، وقسم تواصل فيه واتساب ورقم الهاتف. اذكر الملفات والخطوات بالضبط، وحدّد بوضوح كل ما عليّ تعبئته.",
    },
    {
      title: "أنشئ تطبيقًا",
      description: "حوّل مهمة متكررة إلى تطبيق داخلي صغير.",
      prompt:
        "أنشئ تطبيقًا داخليًا صغيرًا لهذه العملية: [وصف العملية]. حدّد الحقول المطلوبة والشاشات والخطوات، واذكر الافتراضات التي بنيت عليها.",
    },
    {
      title: "قوالب جاهزة",
      description: "اختر نقطة بداية معدة وعدّلها على شغلك.",
      prompt:
        "اعرض القوالب الجاهزة المناسبة لهذا النشاط ورشّح واحدًا منها مع سبب الاختيار.",
    },
  ],
} as const;

const buildTemplates = {
  en: [
    { label: "Service landing page", prompt: "Build a one-page landing page for a cleaning company in Dubai with hero, services, prices, testimonials and a WhatsApp contact button." },
    { label: "Booking page", prompt: "Build a booking page where a customer picks a service, date and time, then sends the request to WhatsApp with all details prefilled." },
    { label: "Small store", prompt: "Build a small store page with up to 12 products, prices in AED, and an order form that sends the order to WhatsApp." },
    { label: "Orders dashboard", prompt: "Build an internal orders dashboard with statuses (new, in progress, done), search, and a daily total." },
    { label: "Quotation generator", prompt: "Build a quotation page that turns selected services and quantities into a printable price quote with VAT." },
    { label: "WhatsApp bot flow", prompt: "Design a WhatsApp bot flow for a service business: greeting, service menu, price ranges, area coverage, and handover to a human." },
  ],
  ar: [
    { label: "صفحة هبوط خدمة", prompt: "أنشئ صفحة هبوط لشركة تنظيف في دبي فيها قسم رئيسي، الخدمات، الأسعار، آراء العملاء، وزر تواصل واتساب." },
    { label: "صفحة حجوزات", prompt: "أنشئ صفحة حجز يختار فيها العميل الخدمة والتاريخ والوقت، ثم تُرسل الطلب إلى واتساب بكل التفاصيل معبأة مسبقًا." },
    { label: "متجر صغير", prompt: "أنشئ صفحة متجر صغير حتى ١٢ منتجًا بأسعار بالدرهم، ونموذج طلب يرسل الطلب إلى واتساب." },
    { label: "لوحة طلبات", prompt: "أنشئ لوحة طلبات داخلية بحالات (جديد، قيد التنفيذ، مكتمل)، وبحث، وإجمالي يومي." },
    { label: "مولد عروض أسعار", prompt: "أنشئ صفحة عرض سعر تحوّل الخدمات والكميات المختارة إلى عرض سعر قابل للطباعة مع الضريبة." },
    { label: "مسار بوت واتساب", prompt: "صمّم مسار بوت واتساب لنشاط خدمي: ترحيب، قائمة خدمات، نطاقات أسعار، مناطق التغطية، ثم تحويل لإنسان." },
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
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-medium text-sm">
            {isArabic ? "أنشئ الآن" : "Build now"}
          </h2>
          <span className="text-muted-foreground text-xs">
            {isArabic ? "اختر وابدأ من قالب جاهز" : "Pick a ready template"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {buildPresets[lang].map((preset, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 8 }}
              key={preset.title}
              transition={{ delay: 0.05 * index, duration: 0.35 }}
              whileHover={{ y: -3 }}
            >
              <Button
                className="h-auto min-h-24 w-full flex-col items-start whitespace-normal p-4 text-start"
                data-testid={`build-preset-${index}`}
                disabled={!canUseAgentMode || !agentModeEnabled}
                onClick={() => onSelectPrompt(preset.prompt)}
                type="button"
                variant="outline"
              >
                <span className="font-medium">{preset.title}</span>
                <span className="text-muted-foreground text-xs">
                  {preset.description}
                </span>
              </Button>
            </motion.div>
          ))}
        </div>
        <style>{`
          @keyframes zoka-rail { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          .zoka-rail-track { animation: zoka-rail 26s linear infinite; }
          .zoka-rail:hover .zoka-rail-track { animation-play-state: paused; }
          @media (prefers-reduced-motion: reduce) {
            .zoka-rail-track { animation: none; }
          }
        `}</style>
        <div className="zoka-rail w-full overflow-hidden">
          <div className="zoka-rail-track flex w-max gap-2">
            {[...buildTemplates[lang], ...buildTemplates[lang]].map(
              (template, index) => (
                <Button
                  className="shrink-0 rounded-full text-xs"
                  disabled={!canUseAgentMode || !agentModeEnabled}
                  key={`${template.label}-${index}`}
                  onClick={() => onSelectPrompt(template.prompt)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {template.label}
                </Button>
              )
            )}
          </div>
        </div>
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
