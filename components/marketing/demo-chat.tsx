"use client";

import { useChat } from "@ai-sdk/react";
import { track } from "@vercel/analytics";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Response } from "@/components/elements/response";
import { DEMO_ASK_EVENT } from "@/components/marketing/task-templates";
import { VoiceInputButton } from "@/components/voice-input-button";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { GUEST_FREE_MESSAGES } from "@/lib/copy";
import { useGuestQuota } from "@/hooks/use-guest-quota";
import { generateUUID } from "@/lib/utils";

type Lang = "ar" | "en";

const STORAGE_KEY = "zooka-demo-handoff";

type Starter = { emoji: string; ar: string; en: string };

const STARTERS: Starter[] = [
  {
    emoji: "✉️",
    ar: "اكتب لي رد احترافي على عميل يشتكي من تأخر الطلب",
    en: "Write a professional reply to a customer complaining about a late order",
  },
  {
    emoji: "📊",
    ar: "حضّر لي خطة محتوى لأسبوع كامل لشركة تنظيف",
    en: "Plan a full week of social content for a cleaning company",
  },
  {
    emoji: "🧾",
    ar: "اكتب عرض سعر مرتب لتنظيف فيلا بعد التسليم",
    en: "Draft a neat quote for a post-handover villa cleaning",
  },
  {
    emoji: "🤖",
    ar: "ايه اللي تقدر تعمله لي لو ربطت جيميل ودرايف؟",
    en: "What can you do for me once Gmail and Drive are connected?",
  },
];

const SECTORS: { key: string; ar: string; en: string; promptAr: string; promptEn: string }[] = [
  {
    key: "cleaning",
    ar: "🧽 تنظيف",
    en: "🧽 Cleaning",
    promptAr:
      "عندي شركة تنظيف في أبوظبي. اكتب لي رد على عميل يسأل عن سعر تنظيف فيلا 4 غرف: صيغة الرد، والبنود، والأسعار سيبها [السعر] عشان أعدّلها.",
    promptEn:
      "I run a cleaning company in Abu Dhabi. Write a reply to a customer asking the price for cleaning a 4-bedroom villa: the structure, the line items, and leave the amounts as [price] for me to fill in.",
  },
  {
    key: "restaurant",
    ar: "🍽️ مطاعم",
    en: "🍽️ Restaurants",
    promptAr:
      "عندي مطعم في دبي. اكتب 3 ردود على تقييمات جوجل: واحد إيجابي، وواحد عن تأخر الطلب، وواحد عن السعر.",
    promptEn:
      "I own a restaurant in Dubai. Write three replies to Google reviews: one positive, one about a late order, one about pricing.",
  },
  {
    key: "clinic",
    ar: "🩺 عيادات",
    en: "🩺 Clinics",
    promptAr:
      "عندي عيادة أسنان. اكتب رسالة تذكير للمرضى بموعدهم مع تعليمات قبل الزيارة، بأسلوب مهني ومختصر.",
    promptEn:
      "I run a dental clinic. Write a patient appointment reminder with pre-visit instructions, professional and brief.",
  },
  {
    key: "realestate",
    ar: "🏠 عقارات",
    en: "🏠 Real estate",
    promptAr:
      "عندي مكتب عقارات في الشارقة. اكتب إعلان قصير لشقة للإيجار بغرفتين، وحدد أهم 3 نقاط تبيعها للعميل.",
    promptEn:
      "I run a real estate office in Sharjah. Write a short ad for a two-bedroom apartment to rent and list its three selling points.",
  },
];

const LAST_TASK_KEY = "zooka-demo-last-task";

const AGENT_STEPS: { icon: string; ar: string; en: string; tool: string }[] = [
  { icon: "🔌", tool: "Gmail", ar: "يفتح صفحة موافقة جوجل الرسمية", en: "Opens Google's official consent screen" },
  { icon: "📥", tool: "Gmail", ar: "يقرأ آخر 20 رسالة غير مقروءة", en: "Reads the last 20 unread emails" },
  { icon: "📁", tool: "Drive", ar: "يبحث عن عرض السعر القديم في ملفاتك", en: "Finds the old quote in your files" },
  { icon: "✍️", tool: "Agent", ar: "يجهّز ردًا لكل عميل بلغته", en: "Drafts a reply for each customer in their language" },
  { icon: "🛡️", tool: "You", ar: "يتوقف ويطلب موافقتك قبل أي إرسال", en: "Stops and asks your approval before sending" },
];

function textOf(message: { parts?: unknown[] }) {
  return (message.parts ?? [])
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text"
    )
    .map((part) => part.text)
    .join("");
}

export function DemoChat({ lang }: { lang: Lang }) {
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const [chatId] = useState(() => generateUUID());
  const [input, setInput] = useState("");
  const quota = useGuestQuota();
  const [sent, setSent] = useState(0);
  const [lastTask, setLastTask] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [agentRun, setAgentRun] = useState(false);
  const [agentStep, setAgentStep] = useState(-1);
  const [voiceOn, setVoiceOn] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const firstPrompt = useRef<string>("");

  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest(request) {
        const last = request.messages.at(-1);
        return {
          body: {
            id: request.id,
            message: last,
            history: request.messages.slice(0, -1),
            selectedChatModel: DEFAULT_CHAT_MODEL,
            selectedVisibilityType: "private",
            agentMode: false,
          },
        };
      },
    }),
    onError: (error) => {
      const message = String(error?.message ?? "");
      if (/payment_required|402|paywall|limit/i.test(message)) {
        setLimitHit(true);
      } else {
        setErrorText(
          t(
            "حصل عطل بسيط في الاتصال. جرّب مرة ثانية.",
            "A small connection hiccup. Please try again."
          )
        );
      }
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const remaining = quota.loaded
    ? Math.min(quota.remaining, Math.max(0, GUEST_FREE_MESSAGES - sent))
    : Math.max(0, GUEST_FREE_MESSAGES - sent);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_TASK_KEY);
      if (stored) {
        setLastTask(stored);
      }
    } catch {
      // storage unavailable: resume chip simply never appears
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status, agentStep]);

  useEffect(() => {
    if (!agentRun) {
      return;
    }
    setAgentStep(0);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      if (step >= AGENT_STEPS.length) {
        window.clearInterval(timer);
        setAgentStep(AGENT_STEPS.length);
        return;
      }
      setAgentStep(step);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [agentRun]);

  const lastAssistantText = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last ? textOf(last) : "";
  }, [messages]);

  useEffect(() => {
    if (!voiceOn || busy || !lastAssistantText || typeof window === "undefined") {
      return;
    }
    if (!("speechSynthesis" in window)) {
      return;
    }
    const clean = lastAssistantText.replace(/[*_#`>|~]/g, " ").slice(0, 600);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = isArabic ? "ar-SA" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [busy, isArabic, lastAssistantText, voiceOn]);

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) {
      return;
    }
    if (remaining <= 0 || quota.isExhausted()) {
      setLimitHit(true);
      track("demo_limit_hit");
      return;
    }
    setErrorText(null);
    if (!firstPrompt.current) {
      firstPrompt.current = value;
    }
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ prompt: firstPrompt.current, at: Date.now() })
      );
    } catch {
      // storage unavailable: the hand-off is a nice-to-have
    }
    setSent((n) => n + 1);
    quota.consume();
    if (sent === 0) {
      track("demo_started");
    }
    setLastTask(value);
    try {
      window.localStorage.setItem(LAST_TASK_KEY, value.slice(0, 300));
    } catch {
      // ignore storage failures
    }
    setInput("");
    void sendMessage({ text: value });
    if (/جيميل|درايف|ربط|اربط|gmail|drive|connect|integrat/i.test(value)) {
      setAgentRun(true);
    }
  }

  // A template card elsewhere on the page can run its prompt in this demo.
  useEffect(() => {
    function onAsk(event: Event) {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (detail?.prompt) {
        submit(detail.prompt);
      }
    }
    window.addEventListener(DEMO_ASK_EVENT, onAsk);
    return () => window.removeEventListener(DEMO_ASK_EVENT, onAsk);
  });

  const empty = messages.length === 0;
  const nudgeAt = 3;
  const usedCount = Math.max(quota.used, sent);
  const showSoftNudge =
    !limitHit && messages.length > 0 && usedCount >= nudgeAt && remaining > 0;

  return (
    <div
      className="relative flex h-[34rem] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1f]/90 shadow-[0_0_80px_-20px_rgba(59,130,246,0.55)] backdrop-blur"
      dir={isArabic ? "rtl" : "ltr"}
      id="demo"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 start-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-blue-500/25 blur-3xl"
      />

      <div className="relative flex items-center justify-between gap-3 border-white/10 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-sm">
            {t("جرّب زوكا الآن — بدون حساب", "Try Zooka now, no account")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            aria-pressed={voiceOn}
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              voiceOn
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                : "border-white/15 text-muted-foreground hover:bg-white/5"
            }`}
            onClick={() => {
              setVoiceOn((v) => !v);
              if (!voiceOn && "speechSynthesis" in window) {
                const unlock = new SpeechSynthesisUtterance(
                  t("الوضع الصوتي مفعّل", "Voice mode on")
                );
                unlock.lang = isArabic ? "ar-SA" : "en-US";
                window.speechSynthesis.speak(unlock);
              }
            }}
            type="button"
          >
            {t("🔊 صوتي", "🔊 Voice")}
          </button>
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-muted-foreground">
            {t(
              `مجانًا اليوم ${remaining}/${GUEST_FREE_MESSAGES}`,
              `Free today ${remaining}/${GUEST_FREE_MESSAGES}`
            )}
          </span>
        </div>
      </div>

      <div className="relative flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="flex h-full flex-col justify-center gap-4">
            <div>
              <p className="font-semibold text-xl">
                {t("اسأل أو أمُر… وشوف النتيجة بنفسك", "Ask or command it, and watch it work")}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t(
                  "اختر طلبًا جاهزًا أو اكتب طلبك. لو ذكرت «جيميل» أو «درايف» هتشوف كيف يتصرف الوكيل بعد الربط.",
                  "Pick a ready request or type your own. Mention Gmail or Drive to see how the agent behaves once connected."
                )}
              </p>
            </div>
            {lastTask ? (
              <button
                className="w-fit rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1.5 text-xs"
                onClick={() => submit(lastTask)}
                type="button"
              >
                {t("↺ كمّل آخر طلب عندك", "↺ Continue your last task")}
              </button>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {SECTORS.map((sector) => (
                <button
                  className="rounded-full border border-white/15 px-3 py-1 text-xs transition-colors hover:border-blue-400/60 hover:bg-white/5"
                  key={sector.key}
                  onClick={() => {
                    track("demo_sector", { sector: sector.key });
                    submit(isArabic ? sector.promptAr : sector.promptEn);
                  }}
                  type="button"
                >
                  {isArabic ? sector.ar : sector.en}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((starter) => (
                <button
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-start text-sm transition-colors hover:border-blue-400/50 hover:bg-blue-500/10"
                  key={starter.en}
                  onClick={() => submit(isArabic ? starter.ar : starter.en)}
                  type="button"
                >
                  <span className="me-1.5">{starter.emoji}</span>
                  {isArabic ? starter.ar : starter.en}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const text = textOf(message);
            if (!text) {
              return null;
            }
            const mine = message.role === "user";
            return (
              <div
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
                key={message.id}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    mine
                      ? "bg-blue-600 text-white"
                      : "border border-white/10 bg-white/[0.04]"
                  }`}
                >
                  {mine ? text : <Response>{text}</Response>}
                  {mine ? null : (
                    <div className="mt-2 flex items-center gap-2 border-white/10 border-t pt-2 text-[11px] text-muted-foreground">
                      <button
                        className="transition-colors hover:text-foreground"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(text)
                            .then(() => setCopiedId(message.id))
                            .catch(() => undefined);
                          track("demo_copy");
                        }}
                        type="button"
                      >
                        {copiedId === message.id
                          ? t("✓ اتنسخ", "✓ Copied")
                          : t("انسخ الرد", "Copy reply")}
                      </button>
                      <span aria-hidden="true">·</span>
                      <Link
                        className="transition-colors hover:text-foreground"
                        href="/register?from=demo"
                        onClick={() => track("demo_signup_click")}
                      >
                        {t("خزّنه في حسابك", "Save it in your account")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {status === "submitted" ? (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
              <span className="size-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-blue-400" />
            </div>
          </div>
        ) : null}

        {agentRun ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.06] p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-300">
                {t("🧭 معاينة وضع الوكيل", "🧭 Agent-mode preview")}
              </span>
              <span className="text-muted-foreground">
                {t("محاكاة توضيحية — الربط الحقيقي بعد التسجيل", "Illustrative — real connections after sign-up")}
              </span>
            </div>
            <ul className="grid gap-1.5 text-xs">
              {AGENT_STEPS.map((step, index) => {
                const state =
                  agentStep > index ? "done" : agentStep === index ? "run" : "wait";
                return (
                  <li
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
                      state === "wait" ? "opacity-35" : "opacity-100"
                    } ${state === "run" ? "bg-white/[0.06]" : ""}`}
                    key={step.en}
                  >
                    <span>{step.icon}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {step.tool}
                    </span>
                    <span className="flex-1">{isArabic ? step.ar : step.en}</span>
                    <span aria-hidden="true">
                      {state === "done" ? "✅" : state === "run" ? "⏳" : "·"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {errorText ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200 text-xs">
            {errorText}
          </p>
        ) : null}

        {showSoftNudge ? (
          <div className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">
              {t(
                `فاضل ${remaining} رسائل. عايز نحفظ الشغل ده ونكمّل؟`,
                `${remaining} messages left. Want us to save this work?`
              )}{" "}
            </span>
            <Link
              className="font-medium text-blue-300 underline"
              href="/register?from=demo"
            >
              {t("سجّل مجانًا", "Sign up free")}
            </Link>
          </div>
        ) : null}

        {limitHit || (remaining <= 0 && !busy && messages.length > 0) ? (
          <div className="rounded-2xl border border-blue-400/40 bg-gradient-to-br from-blue-600/25 to-emerald-500/15 p-4 text-center">
            <p className="font-semibold">
              {t("عجبك؟ كمّل من حيث وقفت", "Liked it? Pick up right where you stopped")}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t(
                "حسابك المجاني يحفظ هذه المحادثة، ويفتح لك ربط جيميل ودرايف ووضع الوكيل الكامل. رسائلك المجانية بتترجع من جديد بكرة الصبح.",
                "A free account keeps this conversation and unlocks Gmail, Drive and full agent mode. Your free messages refresh tomorrow morning."
              )}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Link
                className="rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm"
                href="/register?from=demo"
                onClick={() => track("demo_signup_click")}
              >
                {t("ادخل التطبيق مجانًا ←", "Enter the app free →")}
              </Link>
              <Link
                className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
                href="/login?from=demo"
              >
                {t("عندي حساب", "I have an account")}
              </Link>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="relative flex items-end gap-2 border-white/10 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <textarea
          aria-label={t("اكتب رسالتك", "Type your message")}
          className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-400/60"
          disabled={limitHit}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(input);
            }
          }}
          placeholder={t("اكتب أمرك هنا…", "Type your command…")}
          rows={1}
          value={input}
        />
        <VoiceInputButton
          disabled={busy || limitHit}
          lang={lang}
          onTranscript={(text) => submit(text)}
        />
        {busy ? (
          <button
            className="h-11 rounded-xl border border-white/15 px-4 text-sm hover:bg-white/5"
            onClick={() => stop()}
            type="button"
          >
            {t("إيقاف", "Stop")}
          </button>
        ) : (
          <button
            className="h-11 rounded-xl bg-blue-600 px-5 font-medium text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            disabled={!input.trim() || limitHit}
            type="submit"
          >
            {t("أرسل", "Send")}
          </button>
        )}
      </form>
    </div>
  );
}

/** Used by /register and /login to show a "your request is waiting" banner. */
export function readDemoHandoff(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { prompt?: string; at?: number };
    if (!parsed.prompt || Date.now() - (parsed.at ?? 0) > 6 * 60 * 60 * 1000) {
      return null;
    }
    return parsed.prompt;
  } catch {
    return null;
  }
}
