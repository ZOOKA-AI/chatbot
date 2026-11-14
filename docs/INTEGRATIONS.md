# التكاملات — الحالة الحقيقية وطريق التشغيل

هذا الملف هو المرجع الوحيد لحالة كل تكامل في المشروع: من الكود، ومن متغيّرات البيئة التي يقرأها فعليًا. أي تكامل لا تظهر له متغيّرات هنا يعني أن الكود لا يقرأ له أي إعداد، وليس أنه مضبوط بمكان آخر.

القاعدة المتفق عليها: المفتاح أو كلمة السر تُدخل يدويًا في Vercel → chatbot → Settings → Environment Variables، ولا تُكتب في الكود ولا في هذا الملف ولا تُرسل في محادثة.

## 1. الطبقة الأساسية

| المكوّن | المتغيّرات | الحالة المطلوبة |
|---|---|---|
| قاعدة البيانات (Supabase Postgres + Drizzle) | `DATABASE_URL` (الأولوية) ثم `POSTGRES_URL` | Transaction pooler، بورت 6543، `?pgbouncer=true&sslmode=require`، المستخدم `postgres.<project-ref>` |
| ترحيلات | `MIGRATION_TOKEN` | `/api/admin/migrate` بالترويسة `x-migration-token` |
| نسخ احتياطي | `BACKUP_TOKEN` | `/api/admin/backup` — يغطي 14 جدولًا فقط |
| المصادقة | `AUTH_SECRET`، `NEXTAUTH_SECRET`، `AUTH_URL`، `NEXT_PUBLIC_APP_URL` | في الإنتاج يجب أن يكون `AUTH_URL` هو `https://zooka-ai.com`؛ تُوجَّه صفحات وطلبات الدخول من النطاقات الأخرى إلى هذا النطاق قبل بدء OAuth، وتبقى ملفات التحقق خاصة به |
| الحد من المعدل | `REDIS_URL` | اختياري لكن بدونه الحد يعمل محليًا فقط |
| التخزين | `BLOB_READ_WRITE_TOKEN` | مطلوب لرفع الملفات والصور |

## 2. تسجيل الدخول

| المزوّد | المتغيّرات | ملاحظات |
|---|---|---|
| Google | `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET` | Redirect URI يجب أن يكون `https://zooka-ai.com/api/auth/callback/google` |
| Microsoft | `MICROSOFT_LOGIN_CLIENT_ID`, `MICROSOFT_LOGIN_CLIENT_SECRET` | نفس النمط مع `/api/auth/callback/microsoft` |
| Facebook | `FACEBOOK_LOGIN_CLIENT_ID`, `FACEBOOK_LOGIN_CLIENT_SECRET` | اختياري |
| OTP بالهاتف | `OTP_HASH_SECRET` | يُستخدم لتجزئة الرمز |

## 3. تكاملات جوجل (Drive / Gmail / Calendar)

يستخدمها `lib/integrations/google-drive/*` وتخزين اعتماد مشفّر داخل `GoogleDriveConnection`.

| المتغيّر | الوظيفة |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | عميل OAuth للتكاملات |
| `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` | عميل درايف المخصص |
| `GOOGLE_DRIVE_REDIRECT_URI` | يجب أن يطابق المُسجّل في Google Cloud |
| `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` أو `TOKEN_ENCRYPTION_KEY` | مفتاح AES-256-GCM لتشفير التوكنات، وتغييره يبطل كل الربطات القائمة |

## 4. GitHub وVercel كتكاملين للمستخدم

`lib/integrations/oauth/config.ts` يبني الأسماء ديناميكيًا: `<PROVIDER>_CLIENT_ID` و`<PROVIDER>_CLIENT_SECRET` و`<PROVIDER>_REDIRECT_URI`.

| المزوّد | المتغيّرات | Scopes |
|---|---|---|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `repo`, `read:user` |
| Vercel | `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` | تُعلن على التكامل نفسه، والكود لا يرسل `scope` |
| إجراءات Vercel من السيرفر | `VERCEL_TOKEN` أو `VERCEL_ACCESS_TOKEN`, `VERCEL_TEAM_ID` | لازمة لأي نشر أو ربط دومين من داخل التطبيق |

## 5. المراسلة والنشر

| المزوّد | المتغيّرات | ملاحظات |
|---|---|---|
| WhatsApp Cloud API | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | الرد على الرسائل النصية مفعّل في `app/api/webhooks/whatsapp`. `APP_SECRET` لازم للتحقق من توقيع الطلبات |
| Meta / Instagram | `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID`, `INSTAGRAM_ACCESS_TOKEN` | النشر على الصفحات |
| n8n | `N8N_WEBHOOK_SECRET`, `N8N_WHATSAPP_FORWARD_URL` | تحويل رسائل واتساب إلى سيناريو n8n |

## 6. الفواتير والذكاء الاصطناعي والوسائط

| المجموعة | المتغيّرات |
|---|---|
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` |
| النماذج | `GEMINI_API_KEY`, `GEMINI_TRANSCRIBE_MODEL`, `AI_GATEWAY_API_KEY` |
| البحث | `TAVILY_API_KEY` |
| Base44 agent bridge | `BASE44_AGENT_APP_ID`, `BASE44_AGENT_API_KEY`, `BASE44_AGENT_ALLOW_ALL`, `BASE44_API_BASE` |
| Solas | `SOLAS_AGENT_KEY` |
| Media engine | `MEDIA_ENGINE_PROVIDER`, `MEDIA_ENGINE_WEBHOOK_URL`, `MEDIA_ENGINE_WEBHOOK_SECRET`, `MEDIA_ENGINE_ASSET_HOSTS` |
| تكلفة المخرجات | `CREATIVE_COST_IMAGE_USD`, `CREATIVE_COST_VIDEO_USD` |
| بريد ورسائل | `ZOOKA_MAIL_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID` |
| Webhooks صادرة للوكيل | `AGENT_WEBHOOK_URL`, `AGENT_WEBHOOK_KEY` |

## 7. فجوات معروفة

1. `AgentMessage` مُعرّف في `lib/db/schema.ts` بدون أي ترحيل ينشئه. أُضيف الترحيل `0022_agent_message.sql`. أي بيئة جديدة كانت ستُفشل المحادثات مع الوكيل.
2. `drizzle.config.ts` كان يقرأ `POSTGRES_URL` وحده بينما التطبيق يقدّم `DATABASE_URL`. صارا متطابقين.
3. `.env.example` كان يغطي 27 متغيّرًا فقط من 74 يقرأها الكود. أُعيد بناؤه بالكامل ومجموعًا حسب التكامل.
4. جداول `token_wallets` و`token_grants` تُنشأ وقت التشغيل من `lib/db/token-wallets.ts` وليست ضمن الترحيلات.
5. `supabase/migrations/20261031_integration_catalog.sql` منفصل عن مسار ترحيلات Drizzle، ويجب تطبيقه يدويًا في بيئة جديدة.
