# CURRENT STATE AUDIT — ZOOKA-AI/chatbot

تاريخ الفحص: 22 نوفمبر 2026 · الفرع المرجعي: `main` (بعد دمج #204) · المنفّذ: فحص آلي من نسخة محلية + GitHub API.

كل سطر هنا مأخوذ من الكود أو من تشغيل فعلي. ما لم يمكن التحقق منه مذكور صراحة تحت "غير متحقق".

## 1. ما تم تشغيله فعليًا

| الفحص | الأمر | النتيجة |
| --- | --- | --- |
| TypeScript | `pnpm exec tsc --noEmit` | 0 أخطاء |
| Build | `pnpm build` | ناجح، 198 صفحة، 5 تحذيرات (خطأ `BlogPost` أثناء prerender لأن البناء يسبق الهجرات) |
| الهجرات | `scripts/selfhost/migrate.ts` على PostgreSQL محلي | كل الهجرات حتى `0067_signup_attribution` تطبّقت |
| Vitest (main) | `vitest run` مع قاعدة محلية | 1552 نجاح / 4 فشل (بيئة المتصفح) / 21 تخطٍ |
| Vitest (#213 deps) | نفس الأمر | 1555 نجاح / 4 فشل (`browser-runtime-live` فقط، يُصلَح في #210) / 21 تخطٍ |
| Lint | `pnpm lint` | 5145 خطأ (تقرير فقط، لا يوقف CI) |
| CI gate | آخر 12 تشغيلًا | كلها ناجحة |

## 2. خريطة الكود الفعلية

| المجال | الدليل في الكود | الحالة |
| --- | --- | --- |
| الصفحات | 80 صفحة تحت `app/` (تسويق، `/workspace/*` 27 صفحة، `/admin/*` 19 صفحة، `/settings/*` 5) | موجود |
| واجهات API | 125 ملف `route.ts` | موجود |
| قاعدة البيانات | 73 جدولًا بعد الهجرات، RLS مفعّل على 73/73، 61 سياسة | موجود |
| الهجرات | 98 ملف SQL في `lib/db/migrations` (+ `pending/`) + `supabase/migrations/20261031_integration_catalog.sql` | موجود، مع انحراف موثّق (انظر 5) |
| المصادقة | `app/(auth)`: Google, Facebook, credentials, phone-otp, guest | موجود؛ Microsoft غير مفعّل؛ لا 2FA |
| اللغات | `lib/i18n.ts`: `ar` (افتراضي، RTL، خط Cairo) و `en` | موجود |
| الثيم | `components/theme-provider.tsx` (next-themes) | موجود |
| الجوال | `components/mobile-bottom-nav.tsx` (4 روابط) + `public/sw.js` + `app/manifest.ts` | موجود جزئيًا |
| الوكلاء | `lib/agents/*` (worker, scheduler, approvals, lease, cron) + 8 أدوات في `worker-tools/` | جزئي (ARCHITECTURE_STATUS 006/007/008 = PARTIAL) |
| التكاملات | `lib/integrations/*` 26 مزودًا في `docs/integrations-matrix.md`، 24 منفّذة | لا شيء متحقق حيًا |
| الاستوديو | `/api/studio/*` 15 مسارًا، `lib/studio/gateway` | يحتاج مفتاح مزود (RUNCOMFY/FAL) |
| المطورون | `/developer`، `/settings/mcp`، `/api/mcp` + `mcp_api_key` | موجود؛ لا OpenAPI |
| الإدارة | `/admin/*` 19 قسمًا + `PlatformAuditLog` | موجود |
| النمو | `/workspace/admin/growth`، `ReferralProfile/Event/Invite`، `RewardLedger`، #204 | موجود |
| الاجتماعي | TikTok publish (`TikTokPublishJob`)، `publish_post`، X؛ `/social` في Draft #191 | جزئي |

## 3. ما ليس موجودًا في الكود (بحث نصي = 0 نتائج)

- OpenAPI / توثيق API آلي.
- Feature flags.
- زر إيقاف طارئ للوكلاء (kill switch).
- إصدارات الوكلاء (Version History).
- Workflow builder داخلي.
- تقويم محتوى / جدولة منشورات اجتماعية.
- مصادقة ثنائية (TOTP/2FA).

## 4. حالة الـ PRs المطلوبة

| PR | الحالة | ملاحظة |
| --- | --- | --- |
| #183 | MERGED 2026-11-21 | n8n scheduler endpoint |
| #191 | OPEN Draft | `/social` hub — لم يُدمج |
| #194 | CLOSED | استُبدل بـ #197 |
| #195 | MERGED | روابط الحسابات الرسمية في الفوتر |
| #196 | MERGED | ترتيب مساحات العمل في الإدارة |
| #197 | MERGED | تحميل overview بالتتابع |
| #198 | MERGED | حدود زمنية لقراءات لوحة الإدارة |
| #204 | MERGED | قياس قنوات الاكتساب — يضيف الهجرة `0067_signup_attribution` |

الهجرة 0067 موجودة في `main` وتطبّقت محليًا بنجاح. **تطبيقها على الإنتاج غير متحقق** (لا صلاحية على مشروع Supabase).

## 5. الأخطاء والمخاطر المكتشفة

| # | الخطورة | المشكلة | الدليل | المعالجة |
| --- | --- | --- | --- | --- |
| A1 | عالية | مفتاح relay البريد (zk-mail) في تاريخ git العام | commits `f23bb32`, `0702cb1`, `ebfa266` | تدوير المفتاح (إجراء مالك) |
| A2 | عالية | ثغرات تبعيات: drizzle-orm SQLi، zod، nanoid، playwright | Dependabot | PR #213 (0 high بعده) |
| A3 | متوسطة | ملاحظات أمنية: مطابقة host، فك ترميز، فلاتر وسوم، web-preview | CodeQL + مراجعة | PR #210 |
| A4 | متوسطة | الكود يقرأ 139 متغير بيئة، `.env.example` فيه 89 | `rg process.env` | PR #212 |
| A5 | متوسطة | 15 جدولًا (`integration_audit`, `usage_counter`, `integration_provider`, `mcp_api_key`, ...) تُنشأ عبر `/api/admin/migrate` لا عبر هجرة مرقّمة | `docs/engineering/DATABASE_SCHEMA_DRIFT_REPORT.md` سطر 48؛ قاعدة محلية مهاجَرة لا تحتوي `integration_audit`/`usage_counter` بينما `lib/integrations/connectors/execute.ts` يكتب فيهما | هجرة idempotent مرقّمة (P1، تحتاج موافقة) |
| A6 | منخفضة | 5145 خطأ lint | `pnpm lint` | تنظيف تدريجي |
| A7 | منخفضة | PR #110 مفتوح رغم دمج محتواه فعليًا | GitHub | إغلاق بقرار مالك |

## 6. غير متحقق (حواجز وصول)

| المورد | السبب |
| --- | --- |
| Vercel (team zooka-ai1، project chatbot) | التوكن مرفوض `403 invalidToken` حتى بعد إعادة الربط؛ طُلب ربط جديد |
| Supabase `krzfrsaquvmwctsajhlm` | "You do not have permission"؛ المؤسسة المربوطة فيها 0 مشاريع |
| n8n | لا يوجد instance مضاف في n8n-mcp |
| zooka-ai.com | فُحص من الخارج فقط: `/`, `/ar`, `/login`, `/blog`, `/pricing` = 200؛ `/api/health` = 401 |
| التكاملات الـ 24 | لا يوجد اتصال حي واحد متحقق |
