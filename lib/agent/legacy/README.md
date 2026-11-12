# Agent core (legacy / experimental)

المسار الفعلي للمنتج هو `app/(chat)/api/chat/route.ts` مع AI SDK وأداة `saveMemory`
الموجودة في `lib/ai/tools/save-memory.ts`، والذاكرة في `lib/db/agent-memory.ts`.

هذا المجلد يحتفظ بفكرة «دورة ReAct بنصوص وسوم الأدوات» كما وردت من المالك، بعد
تكييفها لتعمل مع بنية المستودع بدل نسخة سوبابيس مستقلة:

- `model.ts`: مزوّد احتياطي عبر `GROQ_API_KEY` أو `GEMINI_API_KEY` فقط لهذا المسار.
- `tools.ts`: بحث ويب (Tavily ثم DuckDuckGo) وحفظ ذاكرة يكتب في `agent_memory`.
- `core.ts`: الدورة نفسها مع حدّ خطوات ونص صريح عند استنفادها.

## لماذا غير موصول بمسار الشات

1. مسار الشات يعتمد tool calling الأصلي في AI SDK، وهو أدق من تحليل وسوم نصية.
2. الرسائل تُحفظ في `Message_v2` عبر `saveMessages`؛ أي مسار موازٍ يحتاج نفس
   الحراسة (ملكية الرسالة، مساحة العمل) وإلا يفتح ثغرة كتابة.
3. المزوّد الحقيقي يمرّ من `lib/ai/providers` مع مفاتيح الإنتاج وقياس التوكنز.

## إن أردت وصله

استخدمه داخل دالة backend أو أداة منفصلة، وأمرّر له `userId` و`organizationId`
من الجلسة، ولا تكتب نتائجه في `Message_v2` دون المرور بـ `saveMessages`.
