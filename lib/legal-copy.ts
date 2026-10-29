import type { Lang } from "@/lib/i18n";

type LegalPageId =
  | "about"
  | "contact"
  | "cookies"
  | "privacy"
  | "refund"
  | "terms";

type LegalPageCopy = {
  title: string;
  sections: { title: string; body: string }[];
};

const legalCopy: Record<Lang, Record<LegalPageId, LegalPageCopy>> = {
  ar: {
    about: {
      title: "من نحن",
      sections: [
        {
          title: "عن Zooka AI",
          body: "تقدّم [LEGAL_ENTITY_NAME] أدوات ذكاء اصطناعي ومحادثة للعمل والأفراد عبر zooka-ai.com.",
        },
        {
          title: "تواصل معنا",
          body: "العنوان: [LEGAL_ADDRESS]. البريد الإلكتروني: [CONTACT_EMAIL].",
        },
      ],
    },
    contact: {
      title: "تواصل معنا",
      sections: [
        {
          title: "الدعم والاستفسارات",
          body: "للدعم أو الأسئلة المتعلقة بالخدمة، راسلنا على [CONTACT_EMAIL].",
        },
        {
          title: "الجهة المشغّلة",
          body: "[LEGAL_ENTITY_NAME]، [LEGAL_ADDRESS].",
        },
      ],
    },
    cookies: {
      title: "سياسة ملفات تعريف الارتباط",
      sections: [
        {
          title: "الاستخدام",
          body: "نستخدم التخزين المحلي والكوكيز الضرورية لتسجيل الدخول واختيار مساحة العمل وتفضيلات اللغة. قد تستخدم أدوات القياس ملفات تقنية وفق إعدادات النشر.",
        },
        {
          title: "اختيارك",
          body: "يمكنك قبول أو رفض الاختياري عبر الشريط الظاهر في الموقع. يمكنك مسح بيانات الموقع من إعدادات المتصفح.",
        },
        {
          title: "التواصل",
          body: "[LEGAL_ENTITY_NAME]، [LEGAL_ADDRESS]، [CONTACT_EMAIL].",
        },
      ],
    },
    privacy: {
      title: "سياسة الخصوصية",
      sections: [
        {
          title: "البيانات التي نعالجها",
          body: "قد نعالج بيانات الحساب ومساحة العمل والمحادثات والاستخدام اللازمة لتشغيل الخدمة وحمايتها وتقديم الفوترة.",
        },
        {
          title: "المشاركة والاحتفاظ",
          body: "نعالج البيانات لتقديم الخدمة، ولا نبيع المعلومات الشخصية. يحتفظ النظام بالبيانات ما دامت لازمة للخدمة أو للالتزامات القانونية.",
        },
        {
          title: "حقوقك والتواصل",
          body: "لطلب الوصول أو الحذف أو للاستفسار، تواصل مع [CONTACT_EMAIL]. الجهة المشغّلة: [LEGAL_ENTITY_NAME]، [LEGAL_ADDRESS].",
        },
      ],
    },
    refund: {
      title: "سياسة الاسترداد",
      sections: [
        {
          title: "الاشتراكات",
          body: "تُدار الاشتراكات عبر Stripe. أوقف التجديد من صفحة إدارة الاشتراك. لا يعني الإلغاء استرداد المبالغ تلقائياً؛ تخضع طلبات الاسترداد للقانون المعمول به وشروط مزود الدفع.",
        },
        {
          title: "طلب المساعدة",
          body: "للاستفسار عن دفعة أو طلب استرداد، أرسل رقم الفاتورة إلى [CONTACT_EMAIL]. الجهة المشغّلة: [LEGAL_ENTITY_NAME]، [LEGAL_ADDRESS].",
        },
      ],
    },
    terms: {
      title: "شروط الخدمة",
      sections: [
        {
          title: "استخدام الخدمة",
          body: "تُقدّم الخدمة كما هي، ويجب استخدامها وفق القوانين وحقوق الآخرين. أنت مسؤول عن مراجعة مخرجات الذكاء الاصطناعي قبل الاعتماد عليها.",
        },
        {
          title: "الحسابات والاشتراكات",
          body: "أنت مسؤول عن بيانات الدخول ونشاط مساحة العمل. قد تتغير حدود الخطط أو تتوقف الخدمة عند إساءة الاستخدام أو عدم سداد الاشتراك.",
        },
        {
          title: "الجهة المشغّلة والتواصل",
          body: "[LEGAL_ENTITY_NAME]، [LEGAL_ADDRESS]، [CONTACT_EMAIL].",
        },
      ],
    },
  },
  en: {
    about: {
      title: "About",
      sections: [
        {
          title: "About Zooka AI",
          body: "[LEGAL_ENTITY_NAME] provides AI and chat tools for individuals and teams at zooka-ai.com.",
        },
        {
          title: "Contact",
          body: "Address: [LEGAL_ADDRESS]. Email: [CONTACT_EMAIL].",
        },
      ],
    },
    contact: {
      title: "Contact",
      sections: [
        {
          title: "Support and questions",
          body: "For support or service questions, email [CONTACT_EMAIL].",
        },
        {
          title: "Operator",
          body: "[LEGAL_ENTITY_NAME], [LEGAL_ADDRESS].",
        },
      ],
    },
    cookies: {
      title: "Cookie Policy",
      sections: [
        {
          title: "Use",
          body: "We use local storage and cookies needed for sign-in, workspace selection, and language preferences. Analytics tools may use technical data depending on deployment settings.",
        },
        {
          title: "Your choice",
          body: "You can accept or reject optional storage using the banner shown on the site. You can clear site data in your browser settings.",
        },
        {
          title: "Contact",
          body: "[LEGAL_ENTITY_NAME], [LEGAL_ADDRESS], [CONTACT_EMAIL].",
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      sections: [
        {
          title: "Data we process",
          body: "We may process account, workspace, conversation, and usage data needed to operate, secure, and bill for the service.",
        },
        {
          title: "Sharing and retention",
          body: "We process data to provide the service and do not sell personal information. Data is retained while needed for the service or legal obligations.",
        },
        {
          title: "Your rights and contact",
          body: "For access, deletion, or questions, contact [CONTACT_EMAIL]. Operator: [LEGAL_ENTITY_NAME], [LEGAL_ADDRESS].",
        },
      ],
    },
    refund: {
      title: "Refund Policy",
      sections: [
        {
          title: "Subscriptions",
          body: "Subscriptions are managed through Stripe. Turn off renewal from subscription management. Cancellation does not automatically refund charges; refund requests are subject to applicable law and payment provider terms.",
        },
        {
          title: "Request help",
          body: "For a payment question or refund request, email the invoice number to [CONTACT_EMAIL]. Operator: [LEGAL_ENTITY_NAME], [LEGAL_ADDRESS].",
        },
      ],
    },
    terms: {
      title: "Terms of Service",
      sections: [
        {
          title: "Using the service",
          body: "The service is provided as is and must be used lawfully and with respect for others' rights. You are responsible for reviewing AI output before relying on it.",
        },
        {
          title: "Accounts and subscriptions",
          body: "You are responsible for your credentials and workspace activity. Plan limits may change and service access may be suspended for abuse or non-payment.",
        },
        {
          title: "Operator and contact",
          body: "[LEGAL_ENTITY_NAME], [LEGAL_ADDRESS], [CONTACT_EMAIL].",
        },
      ],
    },
  },
};

export function getLegalPageCopy(lang: Lang, page: LegalPageId) {
  return legalCopy[lang][page];
}

export type { LegalPageId };
