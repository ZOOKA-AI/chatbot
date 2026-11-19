"use client";

import { useState } from "react";

type Lang = "ar" | "en";

export const DEMO_ASK_EVENT = "zooka:demo-ask";

type Template = {
  icon: string;
  ar: string;
  en: string;
  tagAr: string;
  tagEn: string;
  promptAr: string;
  promptEn: string;
};

const TEMPLATES: Template[] = [
  {
    icon: "✉️",
    tagAr: "بريد",
    tagEn: "Email",
    ar: "رد على شكوى عميل",
    en: "Reply to a customer complaint",
    promptAr:
      "عندي عميل غاضب لأن الطلب اتأخر 3 أيام. اكتب لي رد احترافي يعتذر ويعطي حل واضح ومهلة تسليم جديدة.",
    promptEn:
      "A customer is angry because their order is 3 days late. Write a professional reply with a clear fix and a new delivery date.",
  },
  {
    icon: "📊",
    tagAr: "تقارير",
    tagEn: "Reports",
    ar: "أهم 5 ملاحظات من مبيعات الشهر",
    en: "Top five findings from this month's sales",
    promptAr:
      "اعطيني أهم 5 ملاحظات على مبيعاتي هذا الشهر وكيف أرفع الربح، مع خطوة عملية لكل ملاحظة.",
    promptEn:
      "Give me the five most important findings on this month's sales and how to lift profit, with one practical step each.",
  },
  {
    icon: "🧾",
    tagAr: "عروض",
    tagEn: "Quotes",
    ar: "عرض سعر لتنظيف فيلا",
    en: "Quote for a villa deep clean",
    promptAr:
      "اكتب لي عرض سعر مرتب لتنظيف فيلا 4 غرف بعد التسليم، مع بنود واضحة ومدة تنفيذ وشروط دفع.",
    promptEn:
      "Draft a tidy quote for a post-handover 4-bedroom villa deep clean, with clear line items, duration and payment terms.",
  },
  {
    icon: "📅",
    tagAr: "محتوى",
    tagEn: "Content",
    ar: "خطة محتوى أسبوع لشركة تنظيف",
    en: "A week of content for a cleaning company",
    promptAr:
      "حضّر لي خطة محتوى 7 أيام لشركة تنظيف في الإمارات: فكرة كل يوم، كابشن قصير، و3 هاشتاقات.",
    promptEn:
      "Build a 7-day content plan for a cleaning company in the UAE: one idea per day, a short caption and three hashtags.",
  },
  {
    icon: "🧭",
    tagAr: "وكيل",
    tagEn: "Agent",
    ar: "لخّص بريدي ورتّب أولويتي",
    en: "Summarise my inbox and set priorities",
    promptAr:
      "لو ربطت جيميل: لخّص إيميلات اليوم، قسّمها عاجل/مهم/عادي، واقترح رد لكل إيميل عاجل قبل ما تبعت.",
    promptEn:
      "Once Gmail is connected: summarise today's email, sort it urgent/important/normal, and draft a reply for each urgent one before sending.",
  },
  {
    icon: "🗂️",
    tagAr: "ملفات",
    tagEn: "Files",
    ar: "حوّل ملف درايف لتقرير",
    en: "Turn a Drive file into a report",
    promptAr:
      "لو ربطت درايف: خد آخر ملف مبيعات عندي واعمل منه تقرير صفحة واحدة بالنقاط والأرقام وملاحظاتي.",
    promptEn:
      "Once Drive is connected: take my latest sales file and turn it into a one-page report with the numbers, bullets and notes.",
  },
];

const ROUTINES: { icon: string; ar: string; en: string; whenAr: string; whenEn: string }[] = [
  {
    icon: "🌅",
    ar: "ملخص صباحي",
    en: "Morning brief",
    whenAr: "كل يوم 8:00",
    whenEn: "Daily, 8:00",
  },
  {
    icon: "📨",
    ar: "متابعة العملاء اللي سكتوا",
    en: "Follow up silent customers",
    whenAr: "كل 3 أيام",
    whenEn: "Every 3 days",
  },
  {
    icon: "📈",
    ar: "تقرير أسبوعي للإدارة",
    en: "Weekly report",
    whenAr: "كل خميس",
    whenEn: "Every Thursday",
  },
  {
    icon: "🧮",
    ar: "تدقيق فواتير ومصروفات",
    en: "Invoice and expense check",
    whenAr: "آخر كل شهر",
    whenEn: "End of month",
  },
];

export function askDemo(prompt: string) {
  if (typeof window === "undefined") {
    return;
  }
  const panel = document.getElementById("demo");
  panel?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.dispatchEvent(
    new CustomEvent(DEMO_ASK_EVENT, { detail: { prompt } })
  );
}

export function TaskTemplates({ lang }: { lang: Lang }) {
  const isArabic = lang === "ar";
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [active, setActive] = useState<number | null>(null);

  return (
    <section className="border-b border-white/10" id="templates">
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-blue-400 text-xs uppercase tracking-widest">
              {t("قوالب جاهزة", "Ready-made tasks")}
            </span>
            <h2 className="mt-2 font-semibold text-3xl">
              {t("ابدأ من مهمة… مش من صفحة بيضاء", "Start from a task, not a blank page")}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {t(
                "اختر قالبًا فيتنفّذ فورًا في التجربة فوق، بنفس اللحظة — من غير تسجيل ولا كتابة من الصفر.",
                "Pick a template and it runs instantly in the demo above, with no sign-up and no blank-page moment."
              )}
            </p>
            <p className="mt-2 text-blue-300 text-sm">
              {t("اضغط أي قالب — يشتغل فوق على طول ↑", "Tap any card and it runs above ↑")}
            </p>
          </div>
          <span className="rounded-full border border-white/15 px-3 py-1 text-muted-foreground text-xs">
            {t("10 رسائل مجانية كل يوم", "10 free messages every day")}
          </span>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((template, index) => {
            const prompt = isArabic ? template.promptAr : template.promptEn;
            return (
              <button
                aria-label={t(`نفّذ: ${template.ar}`, `Run: ${template.en}`)}
                className={`group flex flex-col rounded-2xl border p-5 text-start transition-colors hover:border-blue-400/60 hover:bg-blue-500/[0.07] ${
                  active === index
                    ? "border-blue-400/60 bg-blue-500/[0.07]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
                key={template.en}
                onClick={() => {
                  setActive(index);
                  askDemo(prompt);
                }}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{template.icon}</span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {isArabic ? template.tagAr : template.tagEn}
                  </span>
                  {active === index ? (
                    <span className="ms-auto text-[11px] text-blue-300">
                      {t("اتنفّذ فوق ↑", "Running above ↑")}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 font-medium">
                  {isArabic ? template.ar : template.en}
                </h3>
                <p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
                  {prompt}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-12">
          <h3 className="font-semibold text-2xl">
            {t("أو خلّيه يعملها لوحده كل مرة", "Or let it run on a schedule")}
          </h3>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {t(
              "الروتينات دي تتظبط مرة واحدة وتشتغل من نفسها — نفس فكرة فريق بيشتغل بدون ما تطلب كل يوم.",
              "Set these once and they repeat by themselves, so the work happens without you asking every day."
            )}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROUTINES.map((routine) => (
              <div
                className="rounded-2xl border border-white/10 p-4"
                key={routine.en}
              >
                <span className="text-lg">{routine.icon}</span>
                <p className="mt-2 font-medium text-sm">
                  {isArabic ? routine.ar : routine.en}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {isArabic ? routine.whenAr : routine.whenEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
