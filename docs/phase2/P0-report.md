# ZOOKA-AI · Phase 2 · P0 — تقرير التنفيذ

التاريخ: 15 نوفمبر 2026 · الفرع: `p0/dev-foundation` · PR: #76 (draft) · الإنتاج: **لم يُلمس**

## ما نُفِّذ فعليًا
| البند | الحالة |
|---|---|
| Design Tokens للهوية المعتمدة | ✅ `lib/design/tokens.ts` + `styles/zooka-tokens.css` (غير مستوردين في layout) |
| عقود نواة الوكيل | ✅ `lib/agent/{types,registry,policy,killswitch,audit}.ts` |
| Integration Hub (مواصفات) | ✅ `lib/integrations/hub/providers.ts` + `connections.ts` |
| مخطط قاعدة التطوير | ✅ `lib/db/migrations/dev/0021_p0_agent_core.sql` (11 جدولًا + RLS + AuditLog append-only + تحقق ذاتي) |
| بناء Preview | ✅ READY على الالتزام `2db1833` |
| إنشاء zooka-dev | ⛔ محجوب بحصة Supabase Free |
| ربط Preview بقاعدة تطوير | ⛔ يتبع البند السابق |
| تطبيق الجداول واختبار الصلاحيات | ⛔ لا قاعدة تطوير بعد |

## عطل أُصلح داخل P0
الالتزام الأول `15198ff` كسر البناء بـ8 أخطاء Turbopack لأنه **استبدل** `lib/integrations/providers.ts` الموجود (INTEGRATION_PROVIDERS / PROVIDER_CATEGORIES). أُعيد الملف الأصلي من `main` ونُقلت المواصفات إلى `lib/integrations/hub/providers.ts`، ثم نجح البناء.

## الأمان
- فحص الأسرار في شجرة العمل (بلا node_modules/.next/.git): **0 ملف** يحتوي نمط سر.
- Secret scanning على GitHub: **معطّل** على `chatbot` → يُنصح بتفعيله مع Push Protection (بلا تكلفة).
- Code scanning: لا تحليل مضبوط (no analysis found).
- Dependabot المفتوح: `chatbot` **39** (high 16 · medium 16 · low 7 · critical 0) — تصحيح للرقم الشائع 187/14.
  `royalharoon` **110** (high 49 · medium 49 · low 11 · critical 1).
- اكتشاف حرج: **12 متغيرًا مشتركًا بين Production وPreview** ومنها أسرار: `AUTH_SECRET`, `BRAND_SEAL_KEY`, `BLOB_READ_WRITE_TOKEN`, `BASE44_AGENT_API_KEY`, `GEMINI_API_KEY` → المعاينات ترى أسرار الإنتاج. لا يمكن فصلها دون تعديل مدخلات الإنتاج، وهو غير مصرّح به.

## القرار المطلوب
حصة Supabase Free = مشروعان نشطان، والمستخدم ZOOKA-AI استهلكها (المشروع الآخر `bylfizytgayoefuyliix` أيرلندا، خارج هذا الحساب). الخيارات:
1. إيقاف مؤقت لمشروع أيرلندا من لوحة Supabase (إجراء مالك) ثم إنشاء `zooka-dev` مجانًا.
2. ترقية المنظمة إلى Pro (≈25$/شهر) — تكلفة تحتاج موافقة.
3. استخدام Postgres بديل للتطوير (Neon Free) — انحراف عن «Supabase dev» يحتاج موافقة.

---

## P0 متابعة (15 نوفمبر، 21:xx) — مسار Neon Free

### ماذا يحتاج Supabase فعلًا؟ (فحص الكود لا التخمين)
| الحاجة | مستخدمة؟ | الدليل |
|---|---|---|
| Supabase Auth | **لا** | صفر استخدام لـ`supabase-js` أو `@supabase/*` (0 ملف). المصادقة NextAuth مع Google OIDC: `GET /api/auth/providers` يرجّع google فقط، و`/api/auth/session` يرجّع null لغير المسجل. |
| Supabase Storage | **لا** | التخزين عبر `@vercel/blob` في `lib/db/queries.ts` و`lib/media/gateway-image.ts`، والوسائط عبر Base44. صفر `storage.from`. |
| Supabase Vault | **لا** | لا استدعاء لأي Vault. الأسرار في متغيرات Vercel ومخزن n8n المشفّر. |
| Edge Functions | **لا** | لا `functions.invoke`. كل المنطق في Next.js Route Handlers تحت `app/api`. |
| Postgres (Drizzle) | **نعم** | 25 ملف هجرة، 40 جدولًا و12 view في الإنتاج، القراءة/الكتابة عبر `DATABASE_URL`/`POSTGRES_URL`. |

النتيجة: Supabase هنا مجرّد Postgres مُدار. لذلك Neon Free يصلح لقاعدة التطوير **دون** أي تغيير في `SUPABASE_URL` (الذي يبقى كما هو) وبدون نسخ أي سر إنتاج.

### الأدوات الجاهزة (مضافة على الفرع)
- `scripts/dev/apply-dev-schema.mjs`: يطبّق الهجرات 0000–0020 ثم هجرة نواة الوكيل على `DEV_DATABASE_URL` فقط، ويرفض أي عنوان يشير إلى `krzfrsaquvmwctsajhlm` أو `bylfizytgayoefuyliix`، ويرفض العمل في بيئة إنتاج، ويطبع عدد الجداول وتغطية الجداول الأحد عشر.
- `scripts/dev/check-dev-db.mjs`: يشغّل سبعة فحوص حقيقية (اتصال، RLS، صلاحيات anon/authenticated، قراءة/كتابة، سجل تدقيق غير قابل للتعديل، تفرد سياسة الوكيل، تنظيف بيانات الاختبار) بنتيجة PASS/FAIL لكل بند.
- `app/api/dev/db-health/route.ts`: مسار صحة للمعاينة فقط، يرفض العمل إن لم يكن `VERCEL_ENV=preview`، ويحمي نفسه بترويسة `x-dev-health-token`، ويرفض أي عنوان إنتاج، ولا يعيد أي سر (هوست + تأخير + عدد الجداول فقط).
- `package.json`: `dev:db:apply` و`dev:db:check`. و`.env.example`: `DEV_DATABASE_URL` و`DEV_HEALTH_TOKEN` بقيم فارغة.

### العائق الوحيد المتبقي
لا يوجد اعتماد Neon في أي مكان في المساحة: لا `NEON_API_KEY` في `.env` ولا في `vault.json` ولا في نسخه الاحتياطية، والرابط الوحيد الموجود (`ep-fragrant-cherry-…`) كلمة سره صارت `__ROTATED_SECRET__` بعد تنقية الأسرار، فهو غير قابل للاستخدام. إنشاء مشروع Neon يحتاج مفتاح API أو رابط اتصال من المالك.
