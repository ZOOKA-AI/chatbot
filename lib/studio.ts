/** Public review data only. Never put account data or integration secrets here. */
export const studioSections = [
  { id: "home", label: "مساحة العمل" },
  { id: "projects", label: "المشاريع" },
  { id: "templates", label: "قوالب المواقع" },
  { id: "code", label: "الكود والمعاينة" },
  { id: "integrations", label: "التكاملات" },
  { id: "browser", label: "المتصفح" },
  { id: "profile", label: "الملف الشخصي" },
] as const;
export type StudioSection = (typeof studioSections)[number]["id"];
export function isStudioSection(value: string): value is StudioSection {
  return studioSections.some((section) => section.id === value);
}

export const starterTemplates = [
  {
    id: "business",
    title: "موقع شركة خدمات",
    category: "الأعمال",
    description: "صفحة عربية متجاوبة: خدمات، نبذة ودعوة للتواصل.",
    color: "#b8f3cc",
    html: `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نواة | خدمات تصنع الفرق</title><style>body{margin:0;background:#10231e;color:#edf8f1;font-family:system-ui;line-height:1.8}main{max-width:960px;margin:auto;padding:36px 24px}nav{display:flex;justify-content:space-between;border-bottom:1px solid #426157;padding-bottom:20px}h1{font-size:clamp(32px,7vw,66px);line-height:1.4;max-width:700px}.tag{color:#b8f3cc}a{color:inherit}.button{display:inline-block;background:#b8f3cc;color:#10231e;padding:12px 24px;border-radius:30px;text-decoration:none}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:64px}article{border:1px solid #426157;border-radius:20px;padding:24px}footer{padding:40px 0;color:#b0c8bd}</style><main><nav><b>نواة.</b><a href="#services">خدماتنا</a></nav><p class="tag">شريكك في الخطوة القادمة</p><h1>أفكار طموحة.<br>نتائج تصنع الفرق.</h1><p>نساعد علامتك على النمو بتجربة رقمية مصممة حول احتياجات عملائك.</p><a class="button" href="mailto:hello@example.com">لنتحدث عن مشروعك ↗</a><section class="cards" id="services"><article><h2>استراتيجية واضحة</h2><p>من الفكرة إلى خطة عمل قابلة للتنفيذ.</p></article><article><h2>تصميم متقن</h2><p>هوية وتجربة تتحدث بلغة جمهورك.</p></article><article><h2>تطوير مستمر</h2><p>مواقع متجاوبة تنمو مع أعمالك.</p></article></section><footer>قالب تجريبي — استبدل النصوص وعنوان التواصل قبل النشر.</footer></main></html>`,
  },
  {
    id: "portfolio",
    title: "معرض أعمال إبداعي",
    category: "شخصي",
    description: "معرض بسيط للمشاريع والمهارات والهوية الشخصية.",
    color: "#d7c4fa",
    html: `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مساحة إبداعية | معرض أعمال</title><style>body{background:#201b29;color:#faf5ff;font:18px/1.8 system-ui;margin:0}main{max-width:960px;margin:auto;padding:40px 24px}nav{color:#d7c4fa}h1{font-size:clamp(32px,7vw,70px);line-height:1.4}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}article{border-radius:24px;background:#342c42;padding:32px;min-height:160px}a{color:#d7c4fa}small{color:#c6bcd2}</style><main><nav>مساحتي / أعمال مختارة</nav><h1>أحوّل الأفكار<br>إلى تجارب تستحق التذكر.</h1><p>مصمم ومطور مستقل. أعمل عند تقاطع الجمال والوظيفة.</p><section class="grid"><article><small>01 / هوية</small><h2>علامة ذات شخصية</h2><p>رحلة من الفكرة إلى نظام بصري متكامل.</p></article><article><small>02 / منتج رقمي</small><h2>تجربة أقرب للمستخدم</h2><p>تصميم واضح يضع احتياجات الناس أولاً.</p></article></section><p><a href="mailto:hello@example.com">لنعمل معاً ↗</a></p><small>قالب تجريبي — أضف مشاريعك وبياناتك قبل النشر.</small></main></html>`,
  },
  {
    id: "launch",
    title: "إطلاق منتج رقمي",
    category: "منتجات",
    description: "صفحة هبوط للتعريف بالمنتج ومميزاته.",
    color: "#f5cf9a",
    html: `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مدار | أقل تعقيداً، أكثر إنجازاً</title><style>body{background:#221d15;color:#fff7eb;font:18px/1.8 system-ui;margin:0}main{max-width:900px;margin:auto;padding:40px 24px;text-align:center}nav{text-align:right;color:#f5cf9a}h1{font-size:clamp(32px,7vw,64px);line-height:1.4}.pill{display:inline-block;border:1px solid #826543;padding:6px 18px;border-radius:24px;margin-top:60px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:50px}article{background:#372e21;border-radius:20px;padding:24px}a{display:inline-block;background:#f5cf9a;color:#221d15;border-radius:30px;padding:12px 24px;text-decoration:none}footer{margin-top:50px;font-size:14px;color:#d4c0a2}</style><main><nav><b>مدار.</b></nav><span class="pill">بداية جديدة لطريقة عملك</span><h1>أقل تعقيداً.<br>أكثر إنجازاً.</h1><p>اجمع أفكارك ومشاريعك في مساحة واحدة، وركّز على ما يصنع الفرق.</p><a href="mailto:hello@example.com">اطلب تجربة المنتج ↗</a><section><article><h2>وضوح</h2><p>كل شيء في مكانه.</p></article><article><h2>مرونة</h2><p>تجربة تناسب أسلوبك.</p></article><article><h2>تركيز</h2><p>وقت أكثر للإبداع.</p></article></section><footer>قالب تعريفي تجريبي، لا توجد خدمة أو استمارة متصلة.</footer></main></html>`,
  },
] as const;

export type LocalProject = {
  id: string;
  name: string;
  html: string;
  updatedAt: string;
};
export const PROJECT_STORAGE_KEY = "zooka-studio-projects-v1";
export function parseLocalProjects(raw: string | null): LocalProject[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is LocalProject =>
        p !== null &&
        typeof p === "object" &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.html === "string" &&
        typeof p.updatedAt === "string",
    );
  } catch {
    return [];
  }
}

/** Connection UI exists only for these providers in this repository. */
export const implementedConnectionIds = new Set([
  "github",
  "vercel",
  "google_drive",
  "gmail",
  "n8n",
]);
export const extraAutomationProviders = [
  {
    id: "zapier",
    name: "Zapier",
    nameAr: "زابير",
    category: "automation",
    descriptionAr: "ربط التطبيقات عبر سيناريوهات الأتمتة.",
    description: "Connect applications with automation workflows.",
  },
  {
    id: "make",
    name: "Make",
    nameAr: "ميك",
    category: "automation",
    descriptionAr: "تصميم سيناريوهات الأتمتة المرئية.",
    description: "Visual automation scenarios.",
  },
];

export const additionalRequestedProviders = [
  {
    id: "canva",
    name: "Canva",
    nameAr: "كانفا",
    category: "productivity",
    descriptionAr: "تصاميم العلامة التجارية وتصدير المحتوى.",
    description: "Design and export brand assets.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    nameAr: "هب سبوت",
    category: "productivity",
    descriptionAr: "العملاء وجهات الاتصال وخطوط المبيعات.",
    description: "CRM contacts and pipelines.",
  },
  {
    id: "jotform",
    name: "Jotform",
    nameAr: "جوت فورم",
    category: "productivity",
    descriptionAr: "النماذج وجمع الردود.",
    description: "Forms and submissions.",
  },
  {
    id: "fireflies",
    name: "Fireflies",
    nameAr: "فايرفلايز",
    category: "productivity",
    descriptionAr: "نصوص الاجتماعات وملخصاتها.",
    description: "Meeting transcripts and summaries.",
  },
  {
    id: "ahrefs",
    name: "Ahrefs",
    nameAr: "أهرفس",
    category: "ads",
    descriptionAr: "بيانات البحث والكلمات المفتاحية.",
    description: "Search and keyword analytics.",
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    nameAr: "كلافيو",
    category: "communication",
    descriptionAr: "الملفات التسويقية والحملات.",
    description: "Marketing profiles and campaigns.",
  },
  {
    id: "customerio",
    name: "Customer.io",
    nameAr: "كستمر آي أو",
    category: "communication",
    descriptionAr: "رسائل العملاء والحملات.",
    description: "Customer messaging and campaigns.",
  },
  {
    id: "apify",
    name: "Apify",
    nameAr: "أبيفاي",
    category: "automation",
    descriptionAr: "مهام جمع البيانات والأتمتة ضمن صلاحيات المواقع.",
    description: "Authorized data collection and automation.",
  },
  {
    id: "aws_knowledge",
    name: "AWS Knowledge",
    nameAr: "معرفة AWS",
    category: "dev",
    descriptionAr: "الوصول لوثائق AWS؛ لا يمنح إدارة حسابك السحابي.",
    description: "AWS documentation, not cloud account administration.",
  },
  {
    id: "hume",
    name: "Hume",
    nameAr: "هيوم",
    category: "communication",
    descriptionAr: "تجارب الصوت الاصطناعي.",
    description: "AI voice experiences.",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    nameAr: "جوجل جيميني",
    category: "dev",
    descriptionAr:
      "اختيار نماذج جيميني من المحادثة الحالية؛ لا يوجد موصل مستقل هنا.",
    description:
      "Gemini models through existing chat; no separate connector here.",
  },
  {
    id: "my_browser",
    name: "My Browser",
    nameAr: "متصفحي",
    category: "dev",
    descriptionAr: "جلسة متصفح خاصة؛ تحتاج خدمة معزولة أو إضافة موثوقة.",
    description:
      "Private browser sessions require an isolated service or trusted extension.",
  },
];
