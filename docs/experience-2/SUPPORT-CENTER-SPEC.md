# SUPPORT-CENTER-SPEC — مركز الدعم

## المنفّذ في هذا الفرع
- الصفحة `app/support/page.tsx`، المحتوى في `lib/support/content.ts`.
- 6 مواضيع مساعدة، 10 أسئلة شائعة (مع FAQPage JSON-LD).
- Support AI: أزرار أسئلة جاهزة تفتح المحادثة `/?query=...` للمستخدم المسجّل. تعمل بجلسة المستخدم نفسه وصلاحياته؛ لا تصل لبيانات مستخدمين آخرين لأنها تمر بنفس فحوص الجلسة الموجودة.
- تواصل: support@zooka-ai.com (دعم)، info@zooka-ai.com (عام)، قوالب بريد للإبلاغ عن خطأ واقتراح ميزة، وروابط GitHub Issues.
- لا يوجد ادعاء "دعم مباشر 24/7". النص يذكر أن الرد عبر البريد خلال أيام العمل.

## غير منفّذ (يحتاج موافقة)
نظام تذاكر داخلي:
- جدول `support_ticket` (id, userId, workspaceId, subject, body, status[open|pending|resolved], priority, createdAt, updatedAt) وجدول `support_message`.
- يحتاج Database Migration → لا يُطبق على الإنتاج دون موافقة.
- صلاحيات: المستخدم يرى تذاكره فقط؛ الأدمن عبر `adminNavItems(role)` الموجود.

## ملاحظة
لم يُختبر تسليم البريد فعليًا (MX: business904.web-hosting.com موجود).
