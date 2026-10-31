/** Product entry points, not claims of account connection or service uptime. */
export const platformAreas = [
  {
    id: "studio",
    href: "/studio",
    ar: "مساحة الإبداع",
    en: "Creative workspace",
    arDescription: "مشاريع HTML محلية، معاينة معزولة وأدوات بناء.",
    enDescription: "Local HTML projects, isolated previews and building tools.",
    arState: "أدوات محلية",
    enState: "Local tools",
  },
  {
    id: "templates",
    href: "/studio/templates",
    ar: "مكتبة القوالب",
    en: "Template library",
    arDescription: "ستة قوالب قابلة للتعديل والتنزيل، من الأعمال إلى التعليم.",
    enDescription:
      "Six editable, downloadable templates for business and learning.",
    arState: "قابل للتجربة",
    enState: "Try it",
  },
  {
    id: "tasks",
    href: "/studio/tasks",
    ar: "المهام والمشاريع",
    en: "Tasks and projects",
    arDescription: "خطّط وحدّد الأولوية والحالة، مع حفظ على متصفحك.",
    enDescription: "Plan priorities and status, saved in your browser.",
    arState: "يدوي، بلا تنفيذ آلي",
    enState: "Manual, not automated",
  },
  {
    id: "play",
    href: "/studio/play",
    ar: "استراحة وإبداع",
    en: "Play and create",
    arDescription: "اختبار معرفة، لعبة لشخصين وتحديات أفكار جاهزة.",
    enDescription:
      "A knowledge quiz, local two-player game and creative prompts.",
    arState: "بلا بث خارجي",
    enState: "No external streaming",
  },
  {
    id: "integrations",
    href: "/studio/integrations",
    ar: "مركز التكاملات",
    en: "Integration center",
    arDescription:
      "كتالوج الأدوات ومتطلبات الربط الموثقة وحالات جاهزية التنفيذ.",
    enDescription:
      "Tool catalog, documented prerequisites and implementation readiness.",
    arState: "الربط يتطلب تفويضاً",
    enState: "Authorization required",
  },
  {
    id: "account",
    href: "/settings/account",
    ar: "حسابك وفريقك",
    en: "Account and team",
    arDescription: "الحساب والخصوصية، مع إعدادات منفصلة للمساحة والفوترة.",
    enDescription: "Account and privacy, with workspace and billing settings.",
    arState: "يتطلب تسجيل الدخول",
    enState: "Sign-in required",
  },
] as const;

export const readinessItems = [
  {
    ar: "القوالب والمحرر",
    en: "Templates and editor",
    arState: "متاحة محلياً",
    enState: "Available locally",
    arDetail:
      "تحرير HTML وحفظ وتنزيل واستيراد ونسخ احتياطية. الملفات لا تُرفع للخادم، والمعاينة تمنع السكربتات والموارد الخارجية.",
    enDetail:
      "Edit, save, download, import and back up HTML. Files stay local; preview blocks scripts and external resources.",
  },
  {
    ar: "الذكاء الاصطناعي والمحادثة",
    en: "AI and chat",
    arState: "تحتاج تحققاً تشغيلياً",
    enState: "Runtime verification needed",
    arDetail:
      "تطبيق المحادثة قائم، لكن فشل حفظ الرسائل رُصد سابقاً ولم تُثبت معالجته بهذه النسخة. لا تعني جاهزية الصفحة نجاح كل طلب.",
    enDetail:
      "Chat exists, but previously observed message-save failures have not been proven fixed by this revision. A page loading does not validate every request.",
  },
  {
    ar: "الموصلات",
    en: "Connectors",
    arState: "جاهزية متفاوتة",
    enState: "Mixed readiness",
    arDetail:
      "مسارات إعداد لـGoogle Drive وGmail وn8n وGitHub وVercel. حالة حسابك لا تُقرأ هنا، وقد رُصدت أخطاء قاعدة بيانات في حالة اتصال GitHub وVercel. بقية البطاقات ليست موصلات مفعّلة.",
    enDetail:
      "Setup paths exist for Google Drive, Gmail, n8n, GitHub and Vercel. Account status is not read here; GitHub/Vercel status endpoints showed database errors. Other catalog entries are not activated connectors.",
  },
  {
    ar: "المتصفح البعيد",
    en: "Remote browser",
    arState: "غير متصل",
    enState: "Not connected",
    arDetail:
      "المتاح معاينة HTML معزولة فقط. الجلسات البعيدة تحتاج خدمة تنفيذ مستقلة وتفويضاً وعزل المستخدمين.",
    enDetail:
      "Only an isolated HTML preview is available. Remote sessions require an execution service, authorization and user isolation.",
  },
  {
    ar: "الاستضافة والنطاق",
    en: "Hosting and domain",
    arState: "ملاحظة بتاريخ محدد",
    enState: "Dated observation",
    arDetail:
      "فحص 31 أكتوبر 2026 أظهر zooka-ai.com على Vercel مع HTTPS 200. لا توجد مراقبة حية في هذه الصفحة، ولم يُتحقق من موارد AWS المرسلة.",
    enDetail:
      "The October 31, 2026 check showed zooka-ai.com on Vercel with HTTPS 200. This page is not a live monitor; reported AWS resources were not verified.",
  },
  {
    ar: "النشر والتخزين السحابي",
    en: "Publishing and cloud storage",
    arState: "غير مفعّلة في الاستوديو",
    enState: "Not enabled in Studio",
    arDetail:
      "الحفظ محلي والنسخ الاحتياطية غير مشفّرة. لا مزامنة سحابية أو نشر تلقائي، ولا محفظة مالية أو اتصالات فضائية ضمن هذه النسخة.",
    enDetail:
      "Storage is local and backups unencrypted. No cloud sync, automatic deployment, financial wallet or satellite service is included.",
  },
] as const;
