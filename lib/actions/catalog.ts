import "server-only";

import { z } from "zod";

import { isKnownTool } from "@/lib/agents/agent-tools";

/**
 * The Action Catalog: what a customer can ask for, described once and honestly.
 *
 * Every template is a contract, not marketing. The inputs listed here are exactly the keys the
 * worker tool receives, so a template cannot promise an input that never reaches the tool. A
 * template whose tool does not exist is refused at import time rather than offered and failing
 * later, and `executable` is derived from that same check so the catalog can never show a Run
 * control for work the platform cannot actually do.
 *
 * Bump ACTION_CATALOG_VERSION whenever a published template changes shape. The version travels
 * with every task payload, so an execution can be read back against the template it ran under.
 */

export const ACTION_CATALOG_VERSION = 1;

const LOCALIZED = z.object({ ar: z.string().min(2), en: z.string().min(2) });

export const ACTION_CATEGORIES = [
  "research",
  "engineering",
  "marketing",
  "operations",
  "design",
  "creative",
] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const actionInputSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,40}$/, "input keys are lower_snake_case")
      .describe("The payload key the worker tool reads."),
    type: z.enum(["text", "repo", "url", "number"]),
    required: z.boolean(),
    label: LOCALIZED,
    help: LOCALIZED,
    placeholder: z.string().max(120).optional(),
    pattern: z.string().max(200).optional(),
    // Only present for numeric inputs, so a range is stated rather than assumed.
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict();

export const actionTemplateSchema = z
  .object({
    schemaVersion: z.literal(ACTION_CATALOG_VERSION),
    id: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
    version: z.number().int().min(1),
    category: z.enum(ACTION_CATEGORIES),
    title: LOCALIZED,
    description: LOCALIZED,
    inputs: z.array(actionInputSchema).min(1),
    /** The role an agent should have to take this work. Advisory: assignment is explicit. */
    responsibleRole: z.string().min(2).max(64),
    requiredTools: z.array(z.string().min(2)).min(1),
    requiredIntegrations: z.array(z.string().min(2)),
    approval: z.enum(["none", "required"]),
    workflow: z.array(LOCALIZED).min(1),
    outputs: z.array(LOCALIZED).min(1),
    /** True only when every required tool exists in the worker registry. Derived below. */
    executable: z.boolean(),
  })
  .strict();

export type ActionInput = z.infer<typeof actionInputSchema>;
export type ActionTemplate = z.infer<typeof actionTemplateSchema>;

type TemplateDraft = Omit<ActionTemplate, "schemaVersion" | "executable">;

/**
 * Every template whose tools exist. Nothing here is aspirational: if a tool is missing, the
 * template is not published at all rather than published and broken.
 */
const DRAFTS: TemplateDraft[] = [
  {
    id: "repo_health_report",
    version: 1,
    category: "engineering",
    title: {
      ar: "تقرير صحة المستودع",
      en: "Repository health report",
    },
    description: {
      ar: "يقرأ الفروع وآخر الالتزامات وطلبات الدمج المفتوحة في مستودع مصرّح به، ثم يعيد ملخصًا لما يحتاج انتباهك. قراءة فقط ولا يغيّر شيئًا.",
      en: "Reads branches, recent commits and open pull requests in a repository you have authorised, then summarises what needs attention. Read-only; it changes nothing.",
    },
    inputs: [
      {
        key: "repo",
        type: "repo",
        required: true,
        label: { ar: "المستودع", en: "Repository" },
        help: {
          ar: "بصيغة المالك/الاسم، مثل ZOOKA-AI/chatbot. يجب أن يكون ضمن المستودعات المصرّح بها للعامل.",
          en: "Owner/name, for example ZOOKA-AI/chatbot. It must be one of the repositories the worker is authorised to read.",
        },
        placeholder: "ZOOKA-AI/chatbot",
        pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
      },
    ],
    responsibleRole: "researcher",
    requiredTools: ["github_repo_inspect"],
    requiredIntegrations: ["github"],
    approval: "none",
    workflow: [
      { ar: "التحقق من أن المستودع ضمن القائمة المصرّح بها", en: "Confirm the repository is on the authorised list" },
      { ar: "قراءة الفروع وآخر الالتزامات وطلبات الدمج المفتوحة", en: "Read branches, recent commits and open pull requests" },
      { ar: "حفظ القراءة كدليل تنفيذ في قاعدة البيانات", en: "Store the reading as execution evidence in the database" },
    ],
    outputs: [
      { ar: "ملخص حالة المستودع", en: "Repository status summary" },
      { ar: "دليل تنفيذ محفوظ يمكن مراجعته", en: "Stored execution evidence you can re-read" },
    ],
  },
  {
    id: "browser_research",
    version: 1,
    category: "operations",
    title: {
      ar: "جولة متصفح حقيقية",
      en: "Real browser run",
    },
    description: {
      ar: "يفتح متصفحًا حقيقيًا في جلسة خاصة بمساحتك، ويزور موقعًا معلنًا، وينفّذ خطوات محددة — فتح الصفحة، الضغط، الكتابة، الاختيار، التمرير، قراءة المحتوى — ويحفظ لقطات شاشة كدليل. لا يشتري ولا ينشر ولا يرسل ولا يحذف: أي خطوة من هذا النوع تُرفض قبل فتح المتصفح.",
      en: "Opens a real browser in a session owned by your workspace, visits a declared site and runs the steps you specify — navigate, click, type, select, scroll, read — saving screenshots as evidence. It never purchases, publishes, messages or deletes: any such step is refused before a browser opens.",
    },
    inputs: [
      {
        key: "start_url",
        type: "url",
        required: true,
        label: { ar: "الموقع", en: "Website" },
        help: {
          ar: "عنوان كامل يبدأ بـhttps، مثل https://example.com. العناوين الداخلية والشبكات الخاصة مرفوضة.",
          en: "A full https address, for example https://example.com. Internal and private-network addresses are refused.",
        },
        placeholder: "https://example.com",
        pattern: "^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/.*)?$",
      },
      {
        key: "goal",
        type: "text",
        required: true,
        label: { ar: "ما تريده", en: "What you want" },
        help: {
          ar: "وصف قصير للغرض من الجولة، من ١٠ إلى ٣٠٠ حرف، يُسجَّل في سجل الجلسة.",
          en: "A short description of the visit, 10 to 300 characters, recorded in the session timeline.",
        },
        placeholder: "قراءة عنوان الصفحة الرئيسية",
        pattern: "^[A-Za-z0-9\u0600-\u06FF \u060C.,:؟!_-]{10,300}$",
      },
    ],
    requiredTools: ["browser_task_run"],
    requiredIntegrations: [],
    responsibleRole: "owner",
    approval: "none",
    workflow: [
      { ar: "فتح جلسة متصفح خاصة بمساحتك", en: "Open a browser session owned by your workspace" },
      { ar: "التحقق من العنوان ورفض الشبكات الداخلية", en: "Check the address and refuse internal networks" },
      { ar: "تنفيذ الخطوات وتسجيل كل خطوة في السجل", en: "Run the steps and record each one in the timeline" },
      { ar: "حفظ لقطات الشاشة وإغلاق الجلسة", en: "Save screenshots and close the session" },
    ],
    outputs: [
      { ar: "جلسة متصفح بسجل خطوات ولقطات شاشة", en: "A browser session with a step timeline and screenshots" },
      { ar: "ملخص نتيجة يمكن مراجعته لاحقًا", en: "A result summary you can review later" },
    ],
  },
  {
    id: "project_document",
    version: 1,
    category: "operations",
    title: {
      ar: "إنشاء مستند للمشروع",
      en: "Create project document",
    },
    description: {
      ar: "يحوّل موجزك المكتوب إلى مستند مشروع منظم — الهدف والنطاق وخطة التنفيذ والمخاطر ومعايير القبول — ويحفظه داخل المشروع ليكون جاهزًا للفتح والتنزيل في أي وقت. لا يحتاج أي حساب خارجي، ولا يضيف معلومة لم تكتبها.",
      en: "Turns your written brief into a structured project document — objective, scope, plan, risks and acceptance criteria — and files it inside the project so you can open or download it later. It needs no external account and adds no information you did not write.",
    },
    inputs: [
      {
        key: "title",
        type: "text",
        required: true,
        label: { ar: "عنوان المستند", en: "Document title" },
        help: {
          ar: "اسم قصير وواضح للمستند، من ٣ إلى ١٢٠ حرفًا.",
          en: "A short, clear name for the document, 3 to 120 characters.",
        },
        placeholder: "خطة إطلاق المتجر",
        pattern: "^[A-Za-z0-9\u0600-\u06FF _-]{3,120}$",
      },
      {
        key: "brief",
        type: "text",
        required: true,
        label: { ar: "الموجز", en: "Brief" },
        help: {
          ar: "اكتب الهدف وما يجب إنجازه والموعد والميزانية إن وُجدت، من ٢٠ إلى ٢٠٠٠ حرف. كل جملة تكتبها تصبح بندًا في المستند.",
          en: "Write the objective, what must be delivered, any deadline or budget, 20 to 2000 characters. Each sentence you write becomes an item in the document.",
        },
        placeholder: "نريد متجرًا إلكترونيًا لبيع منتجات التنظيف. الإطلاق قبل نهاية الربع. الميزانية محددة. الشحن داخل الإمارات فقط.",
        pattern: "^[\\s\\S]{20,2000}$",
      },
    ],
    responsibleRole: "researcher",
    requiredTools: ["project_document_create"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "التحقق من العنوان والموجز", en: "Validate the title and brief" },
      { ar: "التأكد أن المشروع يخص مساحتك", en: "Confirm the project belongs to your workspace" },
      { ar: "بناء المستند من جملك بالترتيب وحفظه في المشروع", en: "Assemble the document from your sentences, in order, and file it in the project" },
    ],
    outputs: [
      { ar: "مستند منظم يمكن فتحه وتنزيله", en: "A structured document you can open and download" },
      { ar: "سجل يربط المستند بالمهمة التي أنشأته", en: "A record tying the document to the task that created it" },
    ],
  },
  {
    id: "workspace_readiness_report",
    version: 1,
    category: "operations",
    title: {
      ar: "تقرير جاهزية مساحة العمل",
      en: "Workspace readiness report",
    },
    description: {
      ar: "يقرأ سجلات مساحتك أنت — الوكلاء والمشاريع والمهام والجداول والتنفيذات — ويخبرك بما يحتاج انتباهك. لا يحتاج أي حساب خارجي ولا مفتاح، ولا يقرأ بيانات مساحة أخرى، ولا يغيّر شيئًا.",
      en: "Reads your own workspace records — agents, projects, tasks, schedules and executions — and tells you what needs attention. No external account or key is needed, it never reads another workspace, and it changes nothing.",
    },
    inputs: [
      {
        key: "label",
        type: "text",
        required: true,
        label: { ar: "اسم التقرير", en: "Report label" },
        help: {
          ar: "اسم قصير يميّز هذا التقرير، من ٣ إلى ٦٠ حرفًا.",
          en: "A short name for this report, 3 to 60 characters.",
        },
        placeholder: "تقرير الاثنين",
        // An explicit range rather than \p{L}: the validator compiles patterns without the
        // unicode flag, so a \p class silently degrades into literal characters there.
        pattern: "^[A-Za-z0-9\u0600-\u06FF _-]{3,60}$",
      },
    ],
    responsibleRole: "researcher",
    requiredTools: ["workspace_readiness_inspect"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "التحقق من اسم التقرير", en: "Validate the report label" },
      { ar: "قراءة سجلات مساحتك من قاعدة البيانات", en: "Read your workspace records from the database" },
      { ar: "حفظ القراءة كدليل تنفيذ يمكن مراجعته", en: "Store the reading as evidence you can re-read" },
    ],
    outputs: [
      { ar: "ملخص مكتوب لما يحتاج انتباهك", en: "A written summary of what needs attention" },
      { ar: "أرقام مقروءة من سجلاتك الفعلية مع وقت القياس", en: "Counts read from your real records, with the time measured" },
    ],
  },
  {
    id: "deployment_status_report",
    version: 1,
    category: "engineering",
    title: {
      ar: "تقرير حالة النشر",
      en: "Deployment status report",
    },
    description: {
      ar: "يقرأ حالة آخر نشر لمشروع على فيرسل ونتيجة البناء. قراءة فقط ولا يعيد النشر ولا يغيّر أي إعداد.",
      en: "Reads the latest deployment status and build result for a Vercel project. Read-only; it does not redeploy or change any setting.",
    },
    inputs: [
      {
        key: "project",
        type: "text",
        required: true,
        label: { ar: "اسم المشروع على فيرسل", en: "Vercel project name" },
        help: {
          ar: "اسم المشروع كما يظهر في فيرسل، مثل chatbot. يُطابق حساب فيرسل المرتبط بمساحة العمل.",
          en: "The project name as it appears in Vercel, for example chatbot. Matched against the Vercel account connected to this workspace.",
        },
        placeholder: "chatbot",
      },
    ],
    responsibleRole: "researcher",
    requiredTools: ["vercel_deployment_inspect"],
    requiredIntegrations: ["vercel"],
    approval: "none",
    workflow: [
      { ar: "قراءة آخر نشر للمشروع من فيرسل", en: "Read the project's latest deployment from Vercel" },
      { ar: "قراءة حالة البناء ونتيجته", en: "Read the build state and its result" },
      { ar: "حفظ القراءة كدليل تنفيذ في قاعدة البيانات", en: "Store the reading as execution evidence in the database" },
    ],
    outputs: [
      { ar: "حالة النشر ونتيجة البناء", en: "Deployment state and build result" },
      { ar: "دليل تنفيذ محفوظ يمكن مراجعته", en: "Stored execution evidence you can re-read" },
    ],
  },
  {
    id: "studio_image_edit",
    version: 1,
    category: "creative",
    title: { ar: "تعديل صورة", en: "Edit an image" },
    description: {
      ar: "يعدّل صورة موجودة في مكتبتك — تكبير أو تصغير، قص، أو طباعة نص — وينتج ملفًا جديدًا يحتفظ بأصله. لا يحتاج أي مزوّد خارجي ولا يخترع صورة.",
      en: "Edits an image already in your library — resize, crop or print text — and produces a new file that keeps its original. It needs no external provider and invents nothing.",
    },
    inputs: [
      {
        key: "asset",
        type: "text",
        required: true,
        label: { ar: "الصورة", en: "Image" },
        help: { ar: "اسم الصورة كما رفعتها أو معرّفها.", en: "The image's name as you uploaded it, or its id." },
        placeholder: "صورة-المتجر",
        pattern: "^[A-Za-z0-9\\u0600-\\u06FF _:.\\-]{2,80}$",
      },
      {
        key: "instruction",
        type: "text",
        required: true,
        label: { ar: "ما تريده بالعربية", en: "What you want, in Arabic" },
        help: {
          ar: "مثال: «كبّرها إلى 1080×1920» أو «قص 600×600» أو «اكتب نص: عرض خاص».",
          en: "For example: resize to 1080×1920, crop 600x600, or write the text: special offer.",
        },
        placeholder: "كبّرها إلى 1080×1920",
        pattern: "^[\\s\\S]{3,300}$",
      },
    ],
    responsibleRole: "designer",
    requiredTools: ["studio_image_edit"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "إيجاد الصورة داخل مساحتك بالاسم أو المعرّف", en: "Find the image in your workspace by name or id" },
      { ar: "قراءة طلبك وتحديد التعديل المطلوب", en: "Read your request and identify the edit" },
      { ar: "تنفيذ التعديل وحفظ الناتج كملف جديد قابل للتنزيل", en: "Run the edit and store the result as a new downloadable file" },
    ],
    outputs: [
      { ar: "صورة معدّلة بمقاساتها الحقيقية", en: "An edited image with its real dimensions" },
      { ar: "سجل يربط الناتج بأصله", en: "A record tying the result to its original" },
    ],
  },
  {
    id: "studio_background_remove",
    version: 1,
    category: "creative",
    title: { ar: "إزالة خلفية صورة", en: "Remove an image background" },
    description: {
      ar: "يزيل خلفية صورة داخل مساحتك ويحفظ الشفافية الحقيقية، بمحرّك يعمل على الخادم نفسه بلا أي خدمة مدفوعة. النموذج الافتراضي مرخّص للاستخدام التجاري، ورخصة النموذج تُسجَّل مع الملف.",
      en: "Removes an image's background and keeps real transparency, using an engine that runs on your own server with no paid service. The default model is licensed for commercial use, and the model's licence is recorded with the file.",
    },
    inputs: [
      {
        key: "asset",
        type: "text",
        required: true,
        label: { ar: "الصورة", en: "Image" },
        help: { ar: "اسم الصورة أو معرّفها.", en: "The image's name or id." },
        placeholder: "منتج-1",
        pattern: "^[A-Za-z0-9\\u0600-\\u06FF _:.\\-]{2,80}$",
      },
    ],
    responsibleRole: "designer",
    requiredTools: ["studio_background_remove"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "إيجاد الصورة داخل مساحتك", en: "Find the image in your workspace" },
      { ar: "التحقق من رخصة النموذج قبل التشغيل", en: "Check the model licence before running" },
      { ar: "إزالة الخلفية وحفظ PNG بشفافية مؤكدة", en: "Remove the background and store a PNG with verified transparency" },
    ],
    outputs: [
      { ar: "صورة PNG بخلفية شفافة", en: "A PNG with a transparent background" },
      { ar: "اسم النموذج ورخصته محفوظان مع الملف", en: "The model name and licence stored with the file" },
    ],
  },
  {
    id: "studio_video_render",
    version: 1,
    category: "creative",
    title: { ar: "إنتاج فيديو MP4", en: "Render an MP4" },
    description: {
      ar: "يجمع صورك ومقاطعك في فيديو MP4 حقيقي بمقاس 9:16 أو 1:1 أو 16:9، بمدة تحددها أنت، مع إمكانية إضافة تعليق صوتي عربي. التوليد يتم على الخادم بـffmpeg بلا أي مزوّد مدفوع.",
      en: "Assembles your images and clips into a real MP4 at 9:16, 1:1 or 16:9, with the duration you choose and an optional Arabic narration. Rendering happens on your own server with ffmpeg and no paid provider.",
    },
    inputs: [
      {
        key: "scenes",
        type: "text",
        required: true,
        label: { ar: "المشاهد بالترتيب", en: "Scenes in order" },
        help: {
          ar: "أسماء الوسائط مفصولة بفاصلة، مثل: صورة-1، صورة-2، مقطع-أ.",
          en: "Media names separated by commas, for example: image-1, image-2, clip-a.",
        },
        placeholder: "صورة-1، صورة-2",
        pattern: "^[\\s\\S]{2,300}$",
      },
      {
        key: "aspect",
        type: "text",
        required: false,
        label: { ar: "المقاس", en: "Aspect" },
        help: { ar: "9:16 للستوري، 1:1 للمربع، 16:9 للأفقي. الافتراضي 9:16.", en: "9:16 for stories, 1:1 for square, 16:9 for landscape. Default 9:16." },
        placeholder: "9:16",
        pattern: "^(9:16|1:1|16:9)$",
      },
      {
        key: "narration",
        type: "text",
        required: false,
        label: { ar: "تعليق صوتي عربي", en: "Arabic narration" },
        help: { ar: "اكتب النص وسيُحوَّل إلى صوت على الخادم. اتركه فارغًا لفيديو بلا تعليق.", en: "Type the script and it becomes speech on your server. Leave empty for a silent film." },
        placeholder: "شركة تنظيف في الإمارات، جودة تستحق الثقة.",
        pattern: "^[\\s\\S]{0,600}$",
      },
    ],
    responsibleRole: "designer",
    requiredTools: ["studio_video_render"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "إيجاد كل مشهد داخل مساحتك والتحقق من مدته", en: "Find every scene in your workspace and validate its duration" },
      { ar: "توليد التعليق الصوتي إن كتبته", en: "Synthesise the narration if you wrote one" },
      { ar: "تركيب الفيديو بـffmpeg وقياس الناتج قبل تسليمه", en: "Assemble the film with ffmpeg and measure the output before delivery" },
    ],
    outputs: [
      { ar: "ملف MP4 قابل للتشغيل والتنزيل", en: "A playable, downloadable MP4" },
      { ar: "مدته ومقاسه مقروءان من الملف نفسه", en: "Its duration and size read from the file itself" },
    ],
  },
  {
    id: "studio_ai_generate",
    version: 1,
    category: "creative",
    title: { ar: "توليد صورة أو فيديو بالذكاء الاصطناعي", en: "AI image or video generation" },
    description: {
      ar: "يولّد صورة أو فيديو بموديل سحابي عبر RunComfy Model API v2. هذا الإجراء مدفوع لكل طلب، فلا يعمل إلا بعد: تشغيل المزوّد من المشغّل، وموافقة صريحة على هذه المهمة، وعرض التقدير، وبقاء الطلب داخل سقف الإنفاق، ووجود رصيد. أي شرط ناقص يعني رفضًا قبل الإرسال، ولا يُرسل شيء أبدًا بدون موافقة.",
      en: "Generates an image or video with a cloud model through the RunComfy Model API v2. This action is billed per request, so it runs only when: the operator has enabled the provider, an explicit approval for this job exists, the estimate has been displayed, the job stays inside the spend cap, and the wallet covers it. A missing condition is a refusal before submission, and nothing is ever sent without approval.",
    },
    inputs: [
      {
        key: "prompt",
        type: "text",
        required: true,
        label: { ar: "وصف الصورة أو الفيديو", en: "Image or video description" },
        help: {
          ar: "وصف تفصيلي لما تريد توليده، من 3 إلى 800 حرف. يُرسل كما كتبته إلى الموديل.",
          en: "A detailed description of what to generate, 3 to 800 characters. Sent verbatim to the model.",
        },
        placeholder: "صورة إعلانية احترافية لشركة تنظيف في أبوظبي، إضاءة طبيعية، جودة عالية",
        pattern: "^[\\s\\S]{3,800}$",
      },
      {
        key: "capability",
        type: "text",
        required: false,
        label: { ar: "النوع", en: "Kind" },
        help: { ar: "image أو video. الافتراضي image.", en: "image or video. Default image." },
        placeholder: "image",
        pattern: "^(image|video)$",
      },
      {
        key: "approval_reference",
        type: "text",
        required: false,
        label: { ar: "مرجع الموافقة", en: "Approval reference" },
        help: {
          ar: "معرّف الموافقة على هذه المهمة تحديدًا. بدونه يُرفض الطلب قبل الإرسال.",
          en: "The approval id for this exact job. Without it the request is refused before submission.",
        },
        placeholder: "approval-id",
        pattern: "^[A-Za-z0-9\\-_.:]{0,120}$",
      },
      {
        key: "aspect",
        type: "text",
        required: false,
        label: { ar: "المقاس", en: "Aspect" },
        help: { ar: "المقاس المطلوب إن كان الموديل يدعمه.", en: "Requested aspect, when the model supports it." },
        placeholder: "9:16",
        pattern: "^(9:16|1:1|16:9)?$",
      },
    ],
    responsibleRole: "designer",
    requiredTools: ["studio_ai_generate"],
    requiredIntegrations: ["runcomfy"],
    // Billable: the catalog itself marks this action as needing a decision, and the tool re-checks it.
    approval: "required",
    workflow: [
      { ar: "التحقق من وجود رمز المزوّد ثم اختيار موديل من الكتالوج الحقيقي", en: "Check the credential, then choose a model from the live catalogue" },
      { ar: "تقدير التكلفة وقراءة الرصيد ثم تطبيق بوابة الإنفاق", en: "Estimate the cost, read the wallet and apply the spend gate" },
      { ar: "الإرسال بعد الموافقة فقط، ثم المتابعة وتنزيل الناتج وتخزينه في مكتبة المساحة", en: "Submit only after approval, then poll, download the output and store it in the workspace library" },
    ],
    outputs: [
      { ar: "ملف صورة أو فيديو حقيقي مخزّن في مكتبتك", en: "A real image or video stored in your library" },
      { ar: "التكلفة الفعلية كما أفاد بها المزوّد", en: "The actual charge as reported by the provider" },
    ],
  },
  {
    id: "studio_promo_video",
    version: 1,
    category: "creative",
    title: { ar: "فيديو ترويجي بتعليق عربي ولوجو", en: "Promo film with Arabic narration and logo" },
    description: {
      ar: "ينتج فيديو ترويجيًا قصيرًا من نص عربي تكتبه: مشاهد بهوية شركتك، ولوجو الشركة على كل مشهد، وتعليق صوتي عربي حقيقي، ثم ملف MP4 قابل للتشغيل. الإنتاج حتمي على خادمك بـffmpeg وPiper، بلا أي توليد صور بالذكاء الاصطناعي وبلا مزوّد مدفوع.",
      en: "Produces a short promo film from your Arabic script: brand scene cards, your company logo on every scene, a real Arabic narration, and a playable MP4. Deterministic production on your own server with ffmpeg and Piper, with no AI image generation and no paid provider.",
    },
    inputs: [
      {
        key: "script",
        type: "text",
        required: true,
        label: { ar: "نص التعليق الصوتي", en: "Narration script" },
        help: {
          ar: "جملة أو جملتان بالعربية تُروى في الفيديو، من 8 إلى 400 حرف.",
          en: "One or two Arabic sentences spoken in the film, 8 to 400 characters.",
        },
        placeholder: "شركة تنظيف في الإمارات، جودة تستحق الثقة، واحجز اليوم.",
        pattern: "^[\\s\\S]{8,400}$",
      },
      {
        key: "scenes",
        type: "text",
        required: true,
        label: { ar: "عناوين المشاهد", en: "Scene titles" },
        help: {
          ar: "عنوان لكل مشهد، مفصولة بفاصلة. يمكن إضافة عنوان فرعي بعد النقطتين: عنوان: عنوان فرعي.",
          en: "One title per scene, separated by commas. A subtitle may follow a colon: title: subtitle.",
        },
        placeholder: "خدمات تنظيف احترافية، فريق موثوق، احجز الآن",
        pattern: "^[\\s\\S]{2,400}$",
      },
      {
        key: "logo",
        type: "text",
        required: false,
        label: { ar: "لوجو الشركة", en: "Company logo" },
        help: {
          ar: "اسم صورة اللوجو في مكتبتك. يُوضع على كل مشهد.",
          en: "The name of the logo image in your library. It is placed on every scene.",
        },
        placeholder: "لوجو",
        pattern: "^[A-Za-z0-9\\u0600-\\u06FF _:.\\-]{0,80}$",
      },
      {
        key: "aspect",
        type: "text",
        required: false,
        label: { ar: "المقاس", en: "Aspect" },
        help: { ar: "9:16 للستوري، 1:1 للمربع، 16:9 للأفقي. الافتراضي 9:16.", en: "9:16 for stories, 1:1 for square, 16:9 for landscape. Default 9:16." },
        placeholder: "9:16",
        pattern: "^(9:16|1:1|16:9)$",
      },
    ],
    responsibleRole: "designer",
    requiredTools: ["studio_promo_video"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "توليد التعليق الصوتي العربي أولًا وقياس مدته", en: "Synthesise the Arabic narration first and measure its length" },
      { ar: "رسم مشهد لكل عنوان بهوية الشركة ولوجوها", en: "Draw one frame per title in the brand style with the logo" },
      { ar: "تقسيم مدة الصوت على المشاهد وتركيب MP4 ثم قياس الناتج", en: "Divide the voice across the scenes, render the MP4 and measure it" },
    ],
    outputs: [
      { ar: "ملف MP4 قابل للتشغيل والتنزيل", en: "A playable, downloadable MP4" },
      { ar: "ملف الصوت العربي منفصلًا إن أردت إعادة الاستخدام", en: "The Arabic audio on its own, reusable" },
    ],
  },
  {
    id: "studio_narration",
    version: 1,
    category: "creative",
    title: { ar: "تعليق صوتي عربي", en: "Arabic narration" },
    description: {
      ar: "يحوّل نصًا عربيًا كتبته إلى ملف صوتي حقيقي بصوت عصبي يعمل على الخادم بلا مفاتيح ولا فواتير. الصوت جاهز للاستخدام في فيديو أو للتنزيل وحده.",
      en: "Turns Arabic text you wrote into a real audio file with a neural voice that runs on your server with no keys and no billing. The track is ready for a video or to download on its own.",
    },
    inputs: [
      {
        key: "script",
        type: "text",
        required: true,
        label: { ar: "النص العربي", en: "Arabic script" },
        help: { ar: "من ٢ إلى ١٢٠٠ حرف. التشكيل والرموز تُنظَّف تلقائيًا قبل النطق.", en: "2 to 1200 characters. Diacritics and markup are cleaned before speaking." },
        placeholder: "تقنية بإيمان، تقدم بأخلاق.",
        pattern: "^[\\s\\S]{2,1200}$",
      },
    ],
    responsibleRole: "designer",
    requiredTools: ["studio_narration"],
    requiredIntegrations: [],
    approval: "none",
    workflow: [
      { ar: "تنظيف النص والتحقق من وجود حروف عربية", en: "Clean the script and confirm it contains Arabic" },
      { ar: "توليد الصوت على الخادم", en: "Synthesise the audio on your server" },
      { ar: "تحويله إلى AAC وقياس مدته", en: "Convert it to AAC and measure its duration" },
    ],
    outputs: [
      { ar: "ملف صوتي بمدة حقيقية", en: "An audio file with a real duration" },
      { ar: "مسار جاهز للدمج في فيديو", en: "A track ready to be muxed into a video" },
    ],
  },
];

function publish(draft: TemplateDraft): ActionTemplate {
  const executable = draft.requiredTools.every((tool) => isKnownTool(tool));
  return actionTemplateSchema.parse({
    ...draft,
    schemaVersion: ACTION_CATALOG_VERSION,
    executable,
  });
}

/** Reads specifically. Sorted by category then id so the catalog is stable between renders. */
export const ACTION_TEMPLATES: ActionTemplate[] = DRAFTS.map(publish).sort((a, b) =>
  a.category === b.category ? a.id.localeCompare(b.id) : a.category.localeCompare(b.category)
);

export function listActions(): ActionTemplate[] {
  return ACTION_TEMPLATES;
}

export function findAction(actionId: string): ActionTemplate | null {
  return ACTION_TEMPLATES.find((template) => template.id === actionId) ?? null;
}

export function actionsExecutableBy(assignedTools: string[]): ActionTemplate[] {
  return ACTION_TEMPLATES.filter(
    (template) => template.executable && template.requiredTools.every((tool) => assignedTools.includes(tool))
  );
}

/**
 * Validates customer input against the template's own declaration.
 *
 * Unknown keys are refused rather than ignored: silently dropping a key the customer typed
 * would let a form look successful while the tool ran on different input.
 */
export function parseActionInputs(
  template: ActionTemplate,
  raw: unknown
): { ok: true; inputs: Record<string, string> } | { ok: false; reason: string; detail?: unknown } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
    return { ok: false, reason: "inputs_must_be_an_object" };
  }
  const provided = (raw ?? {}) as Record<string, unknown>;
  const declared = new Set(template.inputs.map((input) => input.key));
  const unknown = Object.keys(provided).filter((key) => !declared.has(key));
  if (unknown.length > 0) {
    return { ok: false, reason: "unknown_inputs", detail: unknown };
  }

  const inputs: Record<string, string> = {};
  for (const input of template.inputs) {
    const value = provided[input.key];
    const missing = value === undefined || value === null || String(value).trim() === "";
    if (missing) {
      if (input.required) return { ok: false, reason: `missing_${input.key}` };
      continue;
    }
    const text = String(value).trim();
    if (text.length > 500) return { ok: false, reason: `too_long_${input.key}` };
    if (input.pattern && !new RegExp(input.pattern).test(text)) {
      return { ok: false, reason: `invalid_${input.key}` };
    }
    if (input.type === "number") {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) return { ok: false, reason: `invalid_${input.key}` };
      if (input.min !== undefined && numeric < input.min) return { ok: false, reason: `invalid_${input.key}` };
      if (input.max !== undefined && numeric > input.max) return { ok: false, reason: `invalid_${input.key}` };
    }
    inputs[input.key] = text;
  }
  return { ok: true, inputs };
}

/** The payload the worker's tool receives. Keys come from the template, nothing else is added. */
export function actionPayload(
  template: ActionTemplate,
  inputs: Record<string, string>
): { tool: string; payload: Record<string, unknown> } {
  const tool = template.requiredTools[0];
  if (tool === "github_repo_inspect") {
    const repo = inputs.repo ?? "";
    return { tool, payload: { repo } };
  }
  if (tool === "vercel_deployment_inspect") {
    return { tool, payload: { project: inputs.project ?? "" } };
  }
  if (tool === "workspace_readiness_inspect") {
    return { tool, payload: { label: inputs.label ?? "" } };
  }
  if (tool === "browser_task_run") {
    // The steps are derived from the declared goal, never from arbitrary customer markup: this
    // milestone opens the page, reads it and captures evidence. Free-form step plans reach the tool
    // through the worker payload, not through this form.
    const startUrl = String(inputs.start_url ?? "");
    return {
      tool,
      payload: {
        startUrl,
        steps: [
          { action: "navigate", url: startUrl },
          { action: "read" },
          { action: "screenshot", label: "entry" },
        ],
      },
    };
  }
  if (tool === "project_document_create") {
    // projectId is added by the runner from the project the customer chose, never from the form.
    return { tool, payload: { title: inputs.title ?? "", brief: inputs.brief ?? "" } };
  }
  if (tool === "studio_image_edit") {
    return { tool, payload: { asset: inputs.asset ?? "", instruction: inputs.instruction ?? "" } };
  }
  if (tool === "studio_background_remove") {
    return { tool, payload: { asset: inputs.asset ?? "" } };
  }
  if (tool === "studio_video_render") {
    // Scenes are a list the customer wrote; the tool resolves each name inside their own workspace.
    const scenes = (inputs.scenes ?? "")
      .split(/[,،\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((asset) => ({ asset, seconds: 2 }));
    return {
      tool,
      payload: {
        scenes,
        aspect: inputs.aspect || "9:16",
        narration: inputs.narration ?? "",
      },
    };
  }
  if (tool === "studio_ai_generate") {
    return {
      tool,
      payload: {
        prompt: inputs.prompt ?? "",
        capability: inputs.capability || "image",
        approvalReference: inputs.approval_reference || null,
        aspect: inputs.aspect || null,
      },
    };
  }
  if (tool === "studio_promo_video") {
    // The scene list is the customer's own titles; a "title: subtitle" pair is split here so the
    // form stays one field instead of six.
    const scenes = String(inputs.scenes ?? "")
      .split(/[,،\n|]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [title, subtitle] = part.split(/[:：]/);
        return { title: (title ?? "").trim(), subtitle: (subtitle ?? "").trim() || null };
      });
    return {
      tool,
      payload: {
        script: inputs.script ?? "",
        scenes,
        logo: inputs.logo ?? "",
        aspect: inputs.aspect || "9:16",
      },
    };
  }
  if (tool === "studio_narration") {
    return { tool, payload: { text: inputs.script ?? "" } };
  }
  // Unreachable while `executable` is derived from isKnownTool, and refused rather than guessed
  // if a new tool is added to the registry without a mapping here.
  throw new Error(`no payload mapping for tool ${tool}`);
}

/**
 * Reads an Arabic request and names the studio actions that match it.
 *
 * This is deliberately deterministic: a keyword map, not a model. A customer who writes "أزل خلفية
 * الصورة" gets the background action, and a request that matches nothing gets an empty list rather
 * than a plausible-looking guess. The agent may still choose an action another way, but it can always
 * fall back to this, and the reason it chose is inspectable.
 */
const REQUEST_KEYWORDS: Array<{ action: string; match: RegExp }> = [
  // Ordered by what the request is *about*. A film made of photos is about the film, and a caption
  // inside it is a step, so the video wins over the image; a cutout is about the background.
  { action: "studio_background_remove", match: /خلفي|خلفية|اقتطع|افصل|background/i },
  // A film that also names a voice or a logo is the promo composition, not a bare render: it is the
  // action that actually produces the voice and the logo the customer asked for.
  // A request that names AI generation is the billable path, so it is matched before the deterministic
  // edit and render routes that would otherwise claim the same sentence.
  { action: "studio_ai_generate", match: /بالذكاء الاصطناعي|ذكاء اصطناعي|ai (image|video|photo)|generate (an? )?(image|video)|text[- ]to[- ](image|video)/i },
  { action: "studio_promo_video", match: /(فيديو|مقطع|ريلز|video|reel).*(تعليق صوتي|صوت| narration|voice|لوجو|logo)|(تعليق صوتي|لوجو|logo).*(فيديو|video)/i },
  { action: "studio_video_render", match: /فيديو|مقطع|ريلز|موشن|video|reel|mp4/i },
  { action: "studio_narration", match: /تعليق صوتي|نطق|تسجيل صوتي|voiceover|narration|tts/i },
  { action: "studio_image_edit", match: /صورة|صور|قص|تكبير|تصغير|مقاس|طباعة|نص على|image|photo|resize|crop/i },
];

export function matchActionsForRequest(text: string): string[] {
  const request = text.trim();
  if (request.length < 2) return [];
  // One answer, not a pile: the first intention that matches is the one the customer is asking for.
  // Returning every keyword hit would offer "edit an image" to somebody who asked for a film.
  const winner = REQUEST_KEYWORDS.find((entry) => entry.match.test(request));
  if (!winner) return [];
  return findAction(winner.action)?.executable === true ? [winner.action] : [];
}
