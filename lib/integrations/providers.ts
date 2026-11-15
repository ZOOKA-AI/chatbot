export type ProviderStatus = "available" | "beta" | "coming_soon";

export type IntegrationProvider = {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  description: string;
  descriptionAr: string;
  status: ProviderStatus;
  managed: boolean;
};

export const PROVIDER_CATEGORIES: Record<string, { ar: string; en: string }> = {
  communication: { ar: "التواصل", en: "Communication" },
  social: { ar: "التواصل الاجتماعي", en: "Social" },
  ads: { ar: "الإعلانات", en: "Advertising" },
  dev: { ar: "التطوير", en: "Developer" },
  storage: { ar: "التخزين", en: "Storage" },
  productivity: { ar: "الإنتاجية", en: "Productivity" },
  finance: { ar: "المالية", en: "Finance" },
  travel: { ar: "السفر", en: "Travel" },
  automation: { ar: "الأتمتة", en: "Automation" },
  geo: { ar: "الخرائط", en: "Maps" },
  listing: { ar: "الملف التجاري", en: "Business listing" },
  commerce: { ar: "المتاجر", en: "Commerce" },
};

/** Mirrors the integration_provider rows in Supabase (kept static so the
 *  settings page renders instantly and never blocks on the database). */
export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  { id: "gmail", name: "Gmail", nameAr: "جيميل", category: "communication", description: "Read and send email for the user.", descriptionAr: "قراءة وإرسال البريد نيابة عن المستخدم.", status: "available", managed: true },
  { id: "google_drive", name: "Google Drive", nameAr: "جوجل درايف", category: "storage", description: "Search and read files, and store generated assets.", descriptionAr: "البحث عن الملفات وقراءتها وحفظ المخرجات.", status: "available", managed: true },
  { id: "google_calendar", name: "Google Calendar", nameAr: "جوجل كالندر", category: "productivity", description: "Read and create calendar events and reminders.", descriptionAr: "قراءة وإنشاء المواعيد والتذكيرات.", status: "available", managed: true },
  { id: "telegram_ads", name: "Telegram Ads", nameAr: "تيليجرام أدز", category: "ads", description: "Read the connected Telegram Ads account budget and ad performance.", descriptionAr: "قراءة ميزانية حساب تيليجرام أدز وأداء الإعلانات.", status: "available", managed: false },
{ id: "telegram_bot", name: "Telegram Bot", nameAr: "بوت تيليجرام", category: "communication", description: "Read the connected bot, look up a chat, and send a text message after approval.", descriptionAr: "قراءة البوت المتصل، والاستعلام عن محادثة، وإرسال رسالة نصية بعد الموافقة.", status: "available", managed: false },
{ id: "improvmx", name: "Email routing (ImprovMX)", nameAr: "توجيه البريد (ImprovMX)", category: "communication", description: "Read the domains that forward mail and which address each alias delivers to.", descriptionAr: "قراءة النطاقات التي تحوّل البريد والعنوان الذي يصل إليه كل مرسل.", status: "available", managed: false },
{ id: "google_ads", name: "Google Ads", nameAr: "إعلانات جوجل", category: "ads", description: "Read Google Ads accounts, their totals and read-only GAQL queries (through the Ryze connection).", descriptionAr: "قراءة حسابات جوجل الإعلانية وأدائها واستعلامات GAQL للقراءة فقط (عبر اتصال Ryze).", status: "available", managed: false },
  { id: "google_business", name: "Google Business Profile", nameAr: "نشاطي على جوجل", category: "listing", description: "Create and update the business profile, posts and reviews.", descriptionAr: "إنشاء وتحديث ملف النشاط والمنشورات والتقييمات.", status: "coming_soon", managed: false },
  { id: "google_maps", name: "Google Maps Platform", nameAr: "خرائط جوجل", category: "geo", description: "Geocoding, places and map generation.", descriptionAr: "تحديد المواقع والأماكن وإنشاء الخرائط.", status: "beta", managed: false },
  { id: "meta", name: "Meta / Facebook", nameAr: "فيسبوك وميتا", category: "social", description: "Read the connected Facebook page and its posts, and publish text posts after your approval.", descriptionAr: "قراءة صفحة فيسبوك المتصلة ومنشوراتها، ونشر منشور نصي بعد موافقتك.", status: "available", managed: false },
  { id: "instagram", name: "Instagram", nameAr: "إنستغرام", category: "social", description: "Read the connected business account and publish reels or single images.", descriptionAr: "قراءة الحساب التجاري المتصل ونشر الريلز أو الصور المفردة.", status: "available", managed: false },
  { id: "whatsapp", name: "WhatsApp Business", nameAr: "واتساب للأعمال", category: "communication", description: "Read the assigned WhatsApp number and its message templates. Sending needs an approved account and is not wired.", descriptionAr: "قراءة رقم واتساب المسند وقوالب رسائله. الإرسال يحتاج حسابًا معتمدًا وغير مربوط.", status: "coming_soon", managed: false },
  { id: "snapchat", name: "Snapchat", nameAr: "سناب شات", category: "social", description: "Read the connected organization, its ad accounts and campaign status.", descriptionAr: "قراءة المؤسسة المتصلة وحساباتها الإعلانية وحالة الحملات.", status: "available", managed: false },
  { id: "tiktok", name: "TikTok", nameAr: "تيك توك", category: "social", description: "Read the connected TikTok profile. Publishing stays the inbox draft the owner finishes in the app.", descriptionAr: "قراءة ملف تيك توك المتصل. النشر يبقى مسودة الصندوق التي يكملها المالك في التطبيق.", status: "available", managed: false },
  {
    id: "x",
    name: "X (Twitter)",
    nameAr: "إكس (تويتر)",
    category: "social",
    description:
      "Read the connected profile and recent posts with a tenant token. Posting is not implemented.",
    descriptionAr: "قراءة الملف الشخصي وآخر المنشورات بتوكن المستأجر. النشر غير منفّذ.",
    status: "available",
    managed: true,
  },
  { id: "linkedin", name: "LinkedIn", nameAr: "لينكدإن", category: "social", description: "Read the connected member profile and publish a text post after your approval.", descriptionAr: "قراءة الملف الشخصي المتصل ونشر منشور نصي بعد موافقتك.", status: "available", managed: false },
  { id: "github", name: "GitHub", nameAr: "جيت هب", category: "dev", description: "Read code and issues; open issues, commit to branches and open pull requests after your approval.", descriptionAr: "قراءة الكود والمهام، وفتح مهام ورفع تعديلات على فروع وطلبات دمج بعد موافقتك.", status: "available", managed: true },
  { id: "supabase", name: "Supabase", nameAr: "سوبا بيز", category: "dev", description: "Manage database, auth and storage projects.", descriptionAr: "إدارة قاعدة البيانات والمصادقة والتخزين.", status: "beta", managed: false },
  { id: "vercel", name: "Vercel", nameAr: "فيرسل", category: "dev", description: "Connect your account. Agent actions on projects are coming.", descriptionAr: "ربط الحساب. إجراءات الوكيل على المشاريع قادمة.", status: "available", managed: false },
  { id: "stripe", name: "Stripe", nameAr: "سترايب", category: "finance", description: "Payments, subscriptions and invoices.", descriptionAr: "المدفوعات والاشتراكات والفواتير.", status: "coming_soon", managed: true },
  { id: "plaid", name: "Plaid / Open Banking", nameAr: "الخدمات المصرفية المفتوحة", category: "finance", description: "Connect bank accounts read-only for cash-flow insight.", descriptionAr: "ربط الحسابات البنكية للقراءة وتحليل التدفق النقدي.", status: "coming_soon", managed: false },
  { id: "amadeus", name: "Amadeus Flights", nameAr: "حجوزات الطيران", category: "travel", description: "Search flights, fares and hold bookings.", descriptionAr: "البحث عن الرحلات والأسعار وتثبيت الحجوزات.", status: "coming_soon", managed: false },
  { id: "booking", name: "Booking.com", nameAr: "بوكينج", category: "travel", description: "Search hotels and manage reservations.", descriptionAr: "البحث عن الفنادق وإدارة الحجوزات.", status: "coming_soon", managed: false },
  { id: "cloudflare", name: "Cloudflare", nameAr: "كلاودفلير", category: "dev", description: "Read zones and DNS records from the tenant Cloudflare account. DNS changes are not implemented.", descriptionAr: "قراءة النطاقات وسجلات DNS من حساب كلاودفلير للمستأجر. تعديل DNS غير منفّذ.", status: "available", managed: false },
  { id: "namecheap", name: "Namecheap", nameAr: "نيم تشيب", category: "dev", description: "Read domains and DNS from the tenant Namecheap account. Blocked until Namecheap allowlists the egress IP.", descriptionAr: "قراءة النطاقات وDNS من حساب نيم تشيب للمستأجر. محجوب حتى يسمح Namecheap بعنوان IP الصادر.", status: "coming_soon", managed: false },
  { id: "n8n", name: "n8n Automation", nameAr: "أتمتة n8n", category: "automation", description: "Trigger and monitor the workspace automation server.", descriptionAr: "تشغيل ومراقبة سيرفر الأتمتة.", status: "available", managed: false },
  { id: "notion", name: "Notion", nameAr: "نوشن", category: "productivity", description: "Read the integration and search shared pages. Creating or editing pages is not implemented.", descriptionAr: "قراءة التكامل والبحث في الصفحات المشاركة. إنشاء الصفحات أو تعديلها غير منفّذ.", status: "available", managed: false },
  { id: "slack", name: "Slack", nameAr: "سلاك", category: "communication", description: "Read the workspace and its public channels. Sending messages is not implemented.", descriptionAr: "قراءة مساحة العمل وقنواتها العامة. إرسال الرسائل غير منفّذ.", status: "available", managed: false },
  { id: "shopify", name: "Shopify", nameAr: "شوبيفاي", category: "commerce", description: "Read products and count orders from the connected store. Product and order changes are not implemented.", descriptionAr: "قراءة المنتجات وعدّ الطلبات من المتجر المتصل. تعديل المنتجات والطلبات غير منفّذ.", status: "available", managed: false },
  { id: "twilio", name: "Twilio", nameAr: "تويلو", category: "communication", description: "Read the account and its phone numbers. Sending SMS or placing calls is not implemented.", descriptionAr: "قراءة الحساب وأرقام الهاتف. إرسال الرسائل أو إجراء المكالمات غير منفّذ.", status: "available", managed: false },
  { id: "agora", name: "Agora / Daily", nameAr: "مكالمات الفيديو", category: "communication", description: "Live voice and video meeting rooms.", descriptionAr: "غرف الاجتماعات الصوتية والمرئية.", status: "coming_soon", managed: false },
];

export function getIntegrationProviders(whatsappConfigured: boolean) {
  return INTEGRATION_PROVIDERS.map((provider) =>
    provider.id === "whatsapp" && whatsappConfigured
      ? { ...provider, status: "available" as const }
      : provider
  );
}

export function isWhatsAppConfigured(env: Record<string, string | undefined>) {
  return Boolean(
    env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_APP_SECRET &&
      env.WHATSAPP_VERIFY_TOKEN
  );
}
