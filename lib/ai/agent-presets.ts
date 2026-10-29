export const agentPresets = [
  {
    id: "quick-task",
    modelId: "xai/grok-4.1-fast-non-reasoning",
    label: { ar: "مهمة سريعة", en: "Quick task" },
    prompt: {
      ar: "أنجز المهمة التالية باستخدام الأدوات المتاحة عند الحاجة: [اكتب المهمة]. ثم لخّص ما اكتمل وما تعذّر بوضوح.",
      en: "Complete this task using available tools when needed: [describe the task]. Then clearly summarize what succeeded and what could not be completed.",
    },
  },
  {
    id: "research",
    modelId: "google/gemini-3-pro-preview",
    label: { ar: "بحث ومقارنة", en: "Research and compare" },
    prompt: {
      ar: "ابحث على الويب عن [الموضوع]، واستند إلى المصادر التي عثرت عليها، ثم قارن النتائج في نقاط واضحة. اذكر ما لم تتمكن من التحقق منه.",
      en: "Research [topic] on the web, use the sources you find, and compare the results in clear bullet points. Call out anything you could not verify.",
    },
  },
  {
    id: "document",
    modelId: "openai/gpt-5-mini",
    label: { ar: "إنشاء مستند", en: "Create a document" },
    prompt: {
      ar: "أنشئ مستنداً منظماً عن [الموضوع] باستخدام أداة إنشاء المستند. اجعل العنوان واضحاً، وقسّم المحتوى إلى أقسام عملية، ثم لخّص ما أنشأته هنا.",
      en: "Create a structured document about [topic] using the document tool. Give it a clear title and practical sections, then summarize what you created here.",
    },
  },
  {
    id: "url-summary",
    modelId: "anthropic/claude-haiku-4.5",
    label: { ar: "تلخيص رابط", en: "Summarize a link" },
    prompt: {
      ar: "اقرأ هذا الرابط العام: [ضع الرابط هنا]. لخّص محتواه، وافصل بين الحقائق والاستنتاجات، واذكر إن تعذر الوصول إليه.",
      en: "Read this public URL: [paste the URL here]. Summarize its content, separate facts from inferences, and say if you could not access it.",
    },
  },
] as const;
