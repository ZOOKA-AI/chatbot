/** Reserved extension slots are not working tools. Wire a route only after implementation and testing. */
export const studioExtensionSlots = [
  {
    id: "collaboration",
    title: "التعاون والمزامنة",
    note: "مكان محجوز لتطوير المشاركة بعد بناء الصلاحيات والتخزين السحابي.",
  },
  {
    id: "live-voice",
    title: "الصوت الحي",
    note: "مكان محجوز بعد توصيل خدمة صوت حقيقية واختبارها؛ الإملاء الحالي ليس مكالمة حية.",
  },
  {
    id: "execution",
    title: "بيئة التنفيذ",
    note: "مكان محجوز للمتصفح والتنفيذ المعزول بعد إعداد الخدمة وحدود الأمان والتكلفة.",
  },
] as const;
