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
  { id: "google_calendar", name: "Google Calendar", nameAr: "جوجل كالندر", category: "productivity", description: "Read and create calendar events and reminders.", descriptionAr: "قراءة وإنشاء المواعيد والتذكيرات.", status: "coming_soon", managed: true },
  { id: "google_ads", name: "Google Ads", nameAr: "إعلانات جوجل", category: "ads", description: "Create and audit ad campaigns and keywords.", descriptionAr: "إنشاء ومراجعة حملات الإعلانات والكلمات المفتاحية.", status: "coming_soon", managed: false },
  { id: "google_business", name: "Google Business Profile", nameAr: "نشاطي على جوجل", category: "listing", description: "Create and update the business profile, posts and reviews.", descriptionAr: "إنشاء وتحديث ملف النشاط والمنشورات والتقييمات.", status: "coming_soon", managed: false },
  { id: "google_maps", name: "Google Maps Platform", nameAr: "خرائط جوجل", category: "geo", description: "Geocoding, places and map generation.", descriptionAr: "تحديد المواقع والأماكن وإنشاء الخرائط.", status: "beta", managed: false },
  { id: "meta", name: "Meta / Facebook", nameAr: "فيسبوك وميتا", category: "social", description: "Publish and manage Facebook pages and ads.", descriptionAr: "النشر وإدارة صفحات فيسبوك والإعلانات.", status: "coming_soon", managed: false },
  { id: "instagram", name: "Instagram", nameAr: "إنستغرام", category: "social", description: "Publish reels, photos and stories.", descriptionAr: "نشر الريلز والصور والقصص.", status: "coming_soon", managed: false },
  { id: "whatsapp", name: "WhatsApp Business", nameAr: "واتساب للأعمال", category: "communication", description: "Send messages and manage templates.", descriptionAr: "إرسال الرسائل وإدارة القوالب.", status: "beta", managed: false },
  { id: "snapchat", name: "Snapchat", nameAr: "سناب شات", category: "social", description: "Publish and advertise on Snapchat.", descriptionAr: "النشر والإعلان على سناب شات.", status: "coming_soon", managed: false },
  { id: "tiktok", name: "TikTok", nameAr: "تيك توك", category: "social", description: "Publish videos through the official content API.", descriptionAr: "نشر الفيديوهات عبر واجهة المحتوى الرسمية.", status: "coming_soon", managed: false },
  { id: "x", name: "X (Twitter)", nameAr: "إكس (تويتر)", category: "social", description: "Post and read timeline content.", descriptionAr: "النشر وقراءة المحتوى.", status: "beta", managed: true },
  { id: "linkedin", name: "LinkedIn", nameAr: "لينكدإن", category: "social", description: "Post to a personal profile or company page.", descriptionAr: "النشر على الملف الشخصي أو صفحة الشركة.", status: "beta", managed: true },
  { id: "github", name: "GitHub", nameAr: "جيت هب", category: "dev", description: "Read code, open issues and ship commits.", descriptionAr: "قراءة الكود وفتح المهام ورفع التعديلات.", status: "available", managed: true },
  { id: "supabase", name: "Supabase", nameAr: "سوبا بيز", category: "dev", description: "Manage database, auth and storage projects.", descriptionAr: "إدارة قاعدة البيانات والمصادقة والتخزين.", status: "beta", managed: false },
  { id: "vercel", name: "Vercel", nameAr: "فيرسل", category: "dev", description: "Deploy and inspect projects and domains.", descriptionAr: "النشر ومراجعة المشاريع والنطاقات.", status: "available", managed: false },
  { id: "stripe", name: "Stripe", nameAr: "سترايب", category: "finance", description: "Payments, subscriptions and invoices.", descriptionAr: "المدفوعات والاشتراكات والفواتير.", status: "beta", managed: true },
  { id: "plaid", name: "Plaid / Open Banking", nameAr: "الخدمات المصرفية المفتوحة", category: "finance", description: "Connect bank accounts read-only for cash-flow insight.", descriptionAr: "ربط الحسابات البنكية للقراءة وتحليل التدفق النقدي.", status: "coming_soon", managed: false },
  { id: "amadeus", name: "Amadeus Flights", nameAr: "حجوزات الطيران", category: "travel", description: "Search flights, fares and hold bookings.", descriptionAr: "البحث عن الرحلات والأسعار وتثبيت الحجوزات.", status: "coming_soon", managed: false },
  { id: "booking", name: "Booking.com", nameAr: "بوكينج", category: "travel", description: "Search hotels and manage reservations.", descriptionAr: "البحث عن الفنادق وإدارة الحجوزات.", status: "coming_soon", managed: false },
  { id: "n8n", name: "n8n Automation", nameAr: "أتمتة n8n", category: "automation", description: "Trigger and monitor the workspace automation server.", descriptionAr: "تشغيل ومراقبة سيرفر الأتمتة.", status: "available", managed: false },
  { id: "notion", name: "Notion", nameAr: "نوشن", category: "productivity", description: "Read and write workspace pages and databases.", descriptionAr: "قراءة وكتابة الصفحات وقواعد البيانات.", status: "coming_soon", managed: false },
  { id: "slack", name: "Slack", nameAr: "سلاك", category: "communication", description: "Send messages and read channels.", descriptionAr: "إرسال الرسائل وقراءة القنوات.", status: "coming_soon", managed: false },
  { id: "shopify", name: "Shopify", nameAr: "شوبيفاي", category: "commerce", description: "Manage products and orders.", descriptionAr: "إدارة المنتجات والطلبات.", status: "coming_soon", managed: false },
  { id: "twilio", name: "Twilio", nameAr: "تويلو", category: "communication", description: "Calls and SMS delivery.", descriptionAr: "المكالمات والرسائل النصية.", status: "coming_soon", managed: false },
  { id: "agora", name: "Agora / Daily", nameAr: "مكالمات الفيديو", category: "communication", description: "Live voice and video meeting rooms.", descriptionAr: "غرف الاجتماعات الصوتية والمرئية.", status: "coming_soon", managed: false },
];
