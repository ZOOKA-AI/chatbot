import type { Lang } from "@/lib/i18n";
import { fillLegalTokens } from "@/lib/legal-entity";

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
          title: "الأمان وكلمة المرور",
          body: "كلمات المرور تُخزَّن مجزّأة بخوارزمية bcrypt ولا يمكن لأي موظف قراءتها. رموز التكاملات (Google وجيت هب وفيرسل وn8n) تُخزَّن مشفّرة بـ AES-256-GCM ولا تظهر في السجلات.",
        },
        {
          title: "مزوّدو نماذج الذكاء الاصطناعي",
          body: "يُرسَل نص المحادثة إلى مزوّد النموذج الذي تختاره لتوليد الرد: Google (Gemini)، OpenAI (GPT)، Anthropic (Claude)، أو xAI (Grok)، عبر بوابة Vercel AI Gateway. لا نبيع المحادثات ولا نستخدمها لتدريب نماذجنا.",
        },
        {
          title: "ملفات تعريف الارتباط",
          body: "نستخدم كوكيز ضرورية لتسجيل الدخول واختيار اللغة وتفضيلات الجلسة، وقياساً مجهول الهوية عبر Vercel Analytics. التفاصيل الكاملة في سياسة الكوكيز على zooka-ai.com/cookies.",
        },
        {
          title: "مدة الاحتفاظ والحذف",
          body: "نحتفظ ببيانات الحساب والمحادثات ما دام الحساب فعّالاً. عند طلب حذف الحساب نحذف البيانات الشخصية خلال 30 يوماً من الطلب، ويبقى الحد الذي تفرضه الفوترة والقانون (مثل سجلات الفواتير) للمدة التي يحددها القانون.",
        },
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
          title: "الشروط ومدة المعالجة",
          body: "يمكن طلب استرداد كامل خلال 7 أيام من أول دفعة للاشتراك إن لم تكن قد استخدمت أكثر من 10% من حد الباقة. بعد ذلك يُراجع الطلب على أساس الاستخدام الفعلي. تُعالج الطلبات المقبولة إلى وسيلة الدفع الأصلية خلال 5 إلى 10 أيام عمل، وقد يستغرق ظهورها في كشف الحساب أياماً إضافية حسب البنك.",
        },
        {
          title: "ما لا يُسترد",
          body: "لا تُسترد الاشتراكات المتجددة المدفوعة بعد بدء دورة الفوترة، ولا الحدود غير المستخدمة، ولا رسوم معالجة الدفع التي خصمها مزوّد الدفع. إلغاء الاشتراك يوقف التجديد التالي فقط.",
        },
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
          title: "سقف المسؤولية",
          body: "مسؤوليتنا الإجمالية عن أي مطالبة مرتبطة بالخدمة لا تتجاوز ما دفعته فعلاً مقابل الاشتراك في الاثني عشر شهراً السابقة للمطالبة. لا نتحمل الأضرار غير المباشرة أو فواتير الأرباح أو الخسائر التبعية، ولا نضمن أن مخرجات الذكاء الاصطناعي صحيحة دائماً، ومراجعتها مسؤوليتك قبل الاعتماد عليها.",
        },
        {
          title: "استنفاد الحد والاستخدام العادل",
          body: "عند استنفاد حد باقتك تتوقف الخدمة عن توليد ردود جديدة حتى بداية الفترة التالية أو الترقية. لا تُرحَّل الرسائل أو التشغيلات غير المستخدمة بين الفترات، ولا يُسترد مقابل الحد غير المستخدم.",
        },
        {
          title: "القانون الحاكم والتعديلات",
          body: "تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة، وتختص محاكم رأس الخيمة بأي نزاع. قد نحدّث الشروط وننشر التحديث على هذه الصفحة، ويُعدّ استمرار استخدامك بعد النشر موافقة عليه.",
        },
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
          title: "Security and passwords",
          body: "Passwords are stored hashed with bcrypt and cannot be read by any member of staff. Integration tokens (Google, GitHub, Vercel, n8n) are encrypted with AES-256-GCM and never written to logs.",
        },
        {
          title: "AI model providers",
          body: "Your message text is sent to the model provider you select in order to generate the reply: Google (Gemini), OpenAI (GPT), Anthropic (Claude), or xAI (Grok), through the Vercel AI Gateway. We do not sell conversations and do not use them to train our own models.",
        },
        {
          title: "Cookies",
          body: "We set cookies required for sign-in, language choice and session preferences, plus anonymous product analytics through Vercel Analytics. The full breakdown is in the cookie policy at zooka-ai.com/cookies.",
        },
        {
          title: "Retention and deletion",
          body: "Account data and conversations are kept while the account is active. On a deletion request we remove personal data within 30 days, except the minimum records billing and the law require us to keep (such as invoices) for the period the law sets.",
        },
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
          title: "Conditions and processing time",
          body: "A full refund can be requested within 7 days of the first subscription payment if you have used no more than 10% of your plan quota. After that, requests are reviewed against actual usage. Approved refunds are returned to the original payment method within 5 to 10 business days, and your bank may take a few more days to post it.",
        },
        {
          title: "What is not refunded",
          body: "Renewed subscription cycles already started, unused quota, and payment-processing fees charged by the payment provider are not refundable. Cancelling stops the next renewal only.",
        },
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
          title: "Limitation of liability",
          body: "Our total liability for any claim connected to the service will not exceed the amount you actually paid for the subscription in the twelve months before the claim. We are not liable for indirect or consequential losses, lost profit, or lost business, and we do not warrant that AI output is always correct; reviewing it before you rely on it is your responsibility.",
        },
        {
          title: "Quota exhaustion and fair use",
          body: "When your plan's quota is used up, the service stops producing new replies until the next period begins or you upgrade. Unused messages or agent runs do not roll over, and unused quota is not refunded.",
        },
        {
          title: "Governing law and changes",
          body: "These terms are governed by the laws of the United Arab Emirates, and the courts of Ras Al Khaimah have jurisdiction over any dispute. We may update these terms and publish the update on this page; continuing to use the service after publication means you accept it.",
        },
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
  const copy = legalCopy[lang][page];
  // Legal pages must never render a raw [TOKEN] to a visitor.
  return {
    ...copy,
    sections: copy.sections.map((section) => ({
      ...section,
      body: fillLegalTokens(section.body, lang),
    })),
  };
}

export type { LegalPageId };
