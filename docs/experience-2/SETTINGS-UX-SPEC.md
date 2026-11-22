# SETTINGS-UX-SPEC — مركز الإعدادات

الصفحة: `app/(chat)/settings/page.tsx` (تتطلب تسجيل الدخول). مركز يجمع 14 قسمًا ويربط كل قسم بالصفحة الموجودة فعلًا بدل إعادة بنائها.

| القسم | الوجهة الفعلية | الحالة المعروضة |
|---|---|---|
| الملف الشخصي | — (الاسم والصورة من طريقة الدخول) | soon |
| الحساب | /settings/account | available |
| الأمان | /forgot-password، /workspace/security (لا 2FA ولا سجل جلسات بعد) | limited |
| المظهر | داخل الصفحة (dark / light / system) | available |
| اللغة | داخل الصفحة (عربي RTL / English) | available |
| الإشعارات | — | soon |
| مساحة العمل | /workspace | available |
| الفريق | /workspace (الأعضاء والدعوات) | available |
| التكاملات | /settings/integrations | available |
| المطور | /settings/mcp، /settings/usage (لا webhooks عامة بعد) | limited |
| مفاتيح API | /settings/mcp (مفاتيح MCP) | available |
| الفوترة | /workspace/billing، /settings/usage | available |
| الخصوصية | /privacy، /cookies | limited |
| إدارة البيانات | /settings/leads، /settings/account (حذف الحساب) | limited |

الإجراءات غير القابلة للتراجع (حذف الحساب) تمر عبر AlertDialog موجود مسبقًا. لم يُضف أي إجراء خطر جديد.
