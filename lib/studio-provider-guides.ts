export type ProviderGuide = {
  auth: string;
  requirements: string[];
  source: string;
};
/** Requirements researched from official sources in docs/provider-readiness.md. Not connection status. */
export const providerGuides: Record<string, ProviderGuide> = {
  whatsapp: {
    auth: "Meta Embedded Signup",
    requirements: [
      "تطبيق Meta لإدخال حسابات العملاء عبر Embedded Signup.",
      "مراجعة التطبيق وصلاحيات Advanced Access المطلوبة قبل الإتاحة العامة.",
      "إعداد رقم العمل وتسجيله وwebhooks موقعة، ثم تنفيذ عمليات الرسائل واختبارها.",
    ],
    source:
      "https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup",
  },
  instagram: {
    auth: "Instagram Login",
    requirements: [
      "حساب مهني: Business أو Creator.",
      "اختر عملياتك أولاً، ثم اطلب instagram_business_basic وصلاحيات النشر أو الرسائل المطلوبة فقط.",
      "تنفيذ التفويض وحفظ الرموز وتحديثها واختبار العمليات؛ مسار Instagram Login لا يمنح إدارة الإعلانات.",
    ],
    source:
      "https://www.postman.com/meta/instagram/folder/23987686-98bfade9-3736-4738-8b4a-f56d6534f6de",
  },
  tiktok: {
    auth: "تطبيق TikTok وتفويض المستخدم",
    requirements: [
      "تسجيل تطبيق ويب، واختيار المنتجات المناسبة؛ النشر والإعلانات منتجان مختلفان.",
      "توثيق ملكية الروابط وإعداد Client key وClient secret على الخادم.",
      "تقديم شرح الصلاحيات وفيديو كامل لمسار الاستخدام لمراجعة التطبيق.",
    ],
    source: "https://developers.tiktok.com/doc/getting-started-create-an-app",
  },
  snapchat: {
    auth: "Marketing / Public Profile OAuth",
    requirements: [
      "حساب أعمال وتطبيق OAuth مناسب لواجهة Marketing، وليس تطبيق Snap Kit بديلاً عنه.",
      "واجهة Public Profile تحتاج إدراج التطبيق في قائمة السماح من Snap.",
      "يُطلب الإذن باستخدام Client ID ووصف الاستخدام، ولا تُرسل Client secret إلى جهة الدعم.",
    ],
    source:
      "https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted",
  },
  linkedin: {
    auth: "OAuth 2.0",
    requirements: [
      "تطبيق LinkedIn والمنتج المناسب للوظيفة المطلوبة.",
      "صلاحية w_member_social للنشر نيابة عن العضو ضمن المنتج المناسب؛ profile وemail للهوية.",
      "إدارة الشركات والصلاحيات الإضافية قد تحتاج موافقة؛ لا يمنح تسجيل الدخول كل صلاحيات الحساب.",
    ],
    source:
      "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access",
  },
  gmail: {
    auth: "Google OAuth",
    requirements: [
      "تصريح موافقة OAuth وحساب مستخدم مخوّل في مساحة العمل.",
      "اطلب أقل صلاحيات لازمة؛ gmail.send حساسة وgmail.readonly مقيّدة.",
      "تحقق الإنتاج والتقييم الأمني حسب استخدام البيانات المقيّدة واستثناءات Google المطبقة.",
    ],
    source: "https://developers.google.com/workspace/gmail/api/auth/scopes",
  },
  n8n: {
    auth: "عنوان السيرفر + API Key",
    requirements: [
      "من n8n: Settings ثم n8n API ثم Create an API key.",
      "تحديد صلاحية وانتهاء المفتاح؛ واجهة API غير متاحة أثناء التجربة المجانية.",
      "بعض المفاتيح تملك وصولاً واسعاً للحساب. استخدم حساب أتمتة منفصلاً، وافتح إعداد الربط الحالي داخل Zooka.",
    ],
    source: "https://docs.n8n.io/connect/n8n-api/authentication",
  },
  make: {
    auth: "API token أو OAuth 2.0",
    requirements: [
      "توكن محدد الصلاحيات أو الحصول على عميل OAuth 2.0.",
      "تحديد عمليات السيناريوهات المطلوبة وتنفيذ التحقق من الاتصال على الخادم.",
      "موافقة المستخدم قبل عمليات الكتابة أو تشغيل سيناريو مؤثر.",
    ],
    source: "https://developers.make.com/api-documentation/authentication",
  },
  zapier: {
    auth: "تكامل Zooka مع Zapier",
    requirements: [
      "بناء triggers وactions حقيقية لتطبيق Zooka، وليس توكناً عاماً لكل أدوات Zapier.",
      "OAuth هو الخيار المفضل؛ إضافة اختبار تحقق فعلي للمصادقة.",
      "تحديد الأحداث والصلاحيات وملكية الحساب قبل نشر التكامل.",
    ],
    source: "https://docs.zapier.com/integrations/build/auth",
  },
  hubspot: {
    auth: "OAuth أو static auth حسب التوزيع",
    requirements: [
      "OAuth للتوزيع على عدة حسابات.",
      "static auth لحساب واحد مصرح به فقط.",
      "تنفيذ إدارة الرموز واختيار أقل صلاحيات للـCRM والتحقق من عزل العملاء.",
    ],
    source:
      "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview",
  },
  klaviyo: {
    auth: "OAuth أو مفتاح خاص على الخادم",
    requirements: [
      "استخدام OAuth للشركاء وإدراج التطبيق في Marketplace.",
      "المفتاح العام أو Site ID لا يتيحان الوصول الخاص لواجهات الخادم.",
      "اختيار نطاقات محددة وإبقاء المفاتيح الخاصة خارج كود المتصفح.",
    ],
    source: "https://developers.klaviyo.com/en/docs/authenticate_",
  },
  apify: {
    auth: "API token",
    requirements: [
      "استخراج API token من صفحة Integrations في Apify Console.",
      "إرساله في ترويسة Authorization بدل الرابط.",
      "تحديد Actors المسموح بها وحدود التكلفة وسياسات الوصول للبيانات.",
    ],
    source: "https://docs.apify.com/api/v2",
  },
  fireflies: {
    auth: "Bearer API key",
    requirements: [
      "من Integrations اختر Fireflies API.",
      "حفظ المفتاح على الخادم وليس المتصفح.",
      "تحديد الاجتماعات المصرح بها واختبار الاستعلامات قبل عرضها للوكيل.",
    ],
    source: "https://docs.fireflies.ai/fundamentals/authorization",
  },
  jotform: {
    auth: "API Key",
    requirements: [
      "من Account API اختر Create New Key.",
      "ابدأ بـRead Access؛ صلاحية Full Access تسمح بالتعديل والحذف.",
      "تنفيذ العمليات واحترام حصة استدعاءات الباقة.",
    ],
    source: "https://www.jotform.com/help/253-how-to-create-a-jotform-api-key/",
  },
  hume: {
    auth: "API key على الخادم",
    requirements: [
      "مفتاح من Hume Portal على الخادم عبر X-Hume-Api-Key.",
      "للواجهات المدعومة في المتصفح: إصدار رمز وصول مؤقت من الخادم.",
      "لا يُرسل المفتاح الدائم للمتصفح؛ يلزم تنفيذ معالجة الصوت والموافقة.",
    ],
    source: "https://dev.hume.ai/docs/introduction/api-key.mdx",
  },
  customerio: {
    auth: "مفتاح خاص للخادم",
    requirements: [
      "من Account Settings ثم API Credentials أنشئ مفتاحاً للمساحة المناسبة.",
      "المفاتيح الخاصة لواجهات الخادم؛ مفاتيح Track القديمة تستخدم Site ID مع المفتاح.",
      "لا تخلط المفاتيح العامة بصلاحيات الإدارة الخاصة، واطلب موافقة قبل الإرسال.",
    ],
    source: "https://docs.customer.io/accounts/settings/managing-credentials/",
  },
  stripe: {
    auth: "مفتاح خادم محدود الصلاحيات",
    requirements: [
      "ابدأ بوضع الاختبار ومفتاح محدود للعمليات المطلوبة.",
      "لا يُكشف المفتاح في المتصفح ولا يُعاد استخدام مفتاح فوترة Zooka لحسابات العملاء.",
      "الربط متعدد التجار يحتاج تصميماً منفصلاً؛ هذه البطاقة لا تفعّل تحصيل المدفوعات.",
    ],
    source: "https://docs.stripe.com/api/authentication",
  },
};
