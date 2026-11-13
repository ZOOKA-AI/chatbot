"use client";

import { motion } from "framer-motion";
import { useState } from "react";

type Lang = "ar" | "en";

type BuildKind = {
  id: string;
  icon: string;
  title: Record<Lang, string>;
  hint: Record<Lang, string>;
  prompt: Record<Lang, string>;
};

const KINDS: BuildKind[] = [
  {
    id: "website",
    icon: "🌐",
    title: { ar: "موقع", en: "Website" },
    hint: { ar: "صفحة هبوط وخدمات وتواصل", en: "Landing, services, contact" },
    prompt: {
      ar: "أنشئ موقعًا لهذا النشاط: [اسم النشاط والخدمات]. ضمّن قسمًا رئيسيًا، والخدمات مع الأسعار، وقسمًا عن الشركة، وقسم تواصل فيه واتساب ورقم الهاتف. حدّد بوضوح كل ما عليّ تعبئته.",
      en: "Build a website for this business: [name and services]. Include a hero, services with prices, an about section and a contact section with WhatsApp and phone. Mark clearly everything I must fill in.",
    },
  },
  {
    id: "app",
    icon: "📱",
    title: { ar: "تطبيق", en: "App" },
    hint: { ar: "أداة داخلية لمهمة متكررة", en: "Internal tool for a repeated task" },
    prompt: {
      ar: "أنشئ تطبيقًا داخليًا صغيرًا لهذه العملية: [وصف العملية]. حدّد الحقول المطلوبة والشاشات والخطوات، واذكر الافتراضات التي بنيت عليها.",
      en: "Build a small internal app for this process: [describe it]. Define the fields, screens and actions, and list your assumptions.",
    },
  },
  {
    id: "store",
    icon: "🛒",
    title: { ar: "متجر", en: "Store" },
    hint: { ar: "منتجات وطلبات عبر واتساب", en: "Products and WhatsApp orders" },
    prompt: {
      ar: "أنشئ متجرًا صغيرًا حتى ١٢ منتجًا بأسعار بالدرهم، ونموذج طلب يرسل الطلب إلى واتساب.",
      en: "Build a small store with up to 12 products priced in AED and an order form that sends the order to WhatsApp.",
    },
  },
  {
    id: "automation",
    icon: "⚙️",
    title: { ar: "أتمتة", en: "Automation" },
    hint: { ar: "سير عمل يعمل من نفسه", en: "Workflows that run themselves" },
    prompt: {
      ar: "صمّم سير عمل أتمتة لهذه المهمة: [المهمة]. حدّد المُشغّل والخطوات والأدوات المطلوبة وما يحتاج موافقتي.",
      en: "Design an automation workflow for this task: [task]. Define the trigger, steps, tools needed and what needs my approval.",
    },
  },
];

const TEMPLATES: { id: string; title: Record<Lang, string>; prompt: Record<Lang, string> }[] = [
  {
    id: "service-landing",
    title: { ar: "صفحة هبوط خدمة", en: "Service landing page" },
    prompt: {
      ar: "أنشئ صفحة هبوط لشركة تنظيف في دبي فيها قسم رئيسي، الخدمات، الأسعار، آراء العملاء، وزر تواصل واتساب.",
      en: "Build a one-page landing page for a cleaning company in Dubai with hero, services, prices, testimonials and a WhatsApp contact button.",
    },
  },
  {
    id: "booking",
    title: { ar: "صفحة حجوزات", en: "Booking page" },
    prompt: {
      ar: "أنشئ صفحة حجز يختار فيها العميل الخدمة والتاريخ والوقت، ثم تُرسل الطلب إلى واتساب بكل التفاصيل.",
      en: "Build a booking page where a customer picks service, date and time, then sends the request to WhatsApp prefilled.",
    },
  },
  {
    id: "quote",
    title: { ar: "مولّد عروض أسعار", en: "Quotation generator" },
    prompt: {
      ar: "أنشئ صفحة عرض سعر تحوّل الخدمات والكميات المختارة إلى عرض سعر قابل للطباعة مع الضريبة.",
      en: "Build a quotation page that turns selected services and quantities into a printable quote with VAT.",
    },
  },
  {
    id: "orders",
    title: { ar: "لوحة طلبات", en: "Orders dashboard" },
    prompt: {
      ar: "أنشئ لوحة طلبات داخلية بحالات (جديد، قيد التنفيذ، مكتمل)، وبحث، وإجمالي يومي.",
      en: "Build an internal orders dashboard with statuses, search and a daily total.",
    },
  },
  {
    id: "portfolio",
    title: { ar: "معرض أعمال", en: "Portfolio" },
    prompt: {
      ar: "أنشئ معرض أعمال بسيطًا للمشاريع والمهارات والهوية الشخصية مع نموذج تواصل.",
      en: "Build a simple portfolio showing projects, skills and identity with a contact form.",
    },
  },
  {
    id: "wa-bot",
    title: { ar: "مسار بوت واتساب", en: "WhatsApp bot flow" },
    prompt: {
      ar: "صمّم مسار بوت واتساب لنشاط خدمي: ترحيب، قائمة خدمات، نطاقات أسعار، مناطق التغطية، ثم تحويل لإنسان.",
      en: "Design a WhatsApp bot flow for a service business: greeting, services menu, price ranges, coverage and human handover.",
    },
  },
];

export function BuildSection({
  lang,
  onSelectPrompt,
}: {
  lang: Lang;
  onSelectPrompt: (prompt: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  // Folded by default: a single compact row of icons, so the conversation
  // keeps the space. Opening it reveals the hints and the ready templates.
  const [open, setOpen] = useState(false);
  const isArabic = lang === "ar";

  return (
    <section
      aria-label={isArabic ? "ابنِ الآن" : "Build now"}
      className="mt-4 w-full"
      data-testid="build-section"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-center gap-2">
        {KINDS.map((kind) => (
          <motion.button
            aria-label={kind.title[lang]}
            className={`zk-neon-hover flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1.5 font-medium text-sm backdrop-blur transition-colors hover:bg-muted/60 ${
              active === kind.id ? "border-primary text-primary" : ""
            }`}
            data-testid={`build-kind-${kind.id}`}
            key={kind.id}
            onClick={() => {
              setActive(kind.id);
              onSelectPrompt(kind.prompt[lang]);
            }}
            title={kind.hint[lang]}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.96 }}
          >
            <span aria-hidden>{kind.icon}</span>
            <span className="hidden sm:inline">{kind.title[lang]}</span>
          </motion.button>
        ))}
        <button
          aria-controls="build-templates"
          aria-expanded={open}
          className="flex size-8 items-center justify-center rounded-full border bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          data-testid="build-section-toggle"
          onClick={() => setOpen((value) => !value)}
          title={isArabic ? "قوالب جاهزة" : "Ready templates"}
          type="button"
        >
          <svg
            aria-hidden="true"
            className={`size-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        id="build-templates"
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="mt-3 flex flex-wrap justify-center gap-2 pb-1">
            {TEMPLATES.map((template) => (
              <button
                className="rounded-full border bg-background/70 px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-muted/60"
                data-testid={`build-template-${template.id}`}
                key={template.id}
                onClick={() => onSelectPrompt(template.prompt[lang])}
                type="button"
              >
                {template.title[lang]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
