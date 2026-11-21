# PRODUCT REQUIREMENTS — مصفوفة الفجوات

المصدر: المخطط الرئيسي المعتمد من المالك (22 نوفمبر 2026) مقابل الكود في `main`.
الأولوية: P0 = أمان/توقف، P1 = جوهر المنتج، P2 = توسّع، P3 = لاحقًا.
المالك: **OWN** = مالك المنصة (قرار/سر/حساب)، **ENG** = هندسة (قابلة للتنفيذ في PR).

| REQUIREMENT | CURRENT IMPLEMENTATION | MISSING WORK | PRIORITY | DEPENDENCIES | RISK | OWNER | ACCEPTANCE TEST |
| --- | --- | --- | --- | --- | --- | --- | --- |
| لا أسرار مكشوفة | الكود نظيف؛ المفتاح في التاريخ فقط | تدوير مفتاح zk-mail | P0 | وصول لوحة البريد | عالٍ | OWN | المفتاح القديم يرجع 401 |
| تبعيات بلا ثغرات عالية | — | دمج #213 | P0 | مراجعة | منخفض | ENG | `pnpm audit --audit-level high` = 0 |
| إصلاحات CodeQL | — | دمج #210 | P0 | مراجعة | منخفض | ENG | الاختبارات الجديدة في #210 تمر |
| بيئة موثّقة كاملة | 89/139 متغير | دمج #212 | P1 | — | منخفض | ENG | كل `process.env.X` موجود في `.env.example` |
| الهجرات تعيد بناء المخطط كاملًا | 15 جدولًا عبر admin route | هجرة مرقّمة idempotent | P1 | مقارنة مع الإنتاج | متوسط | ENG+OWN | قاعدة فارغة + migrate = كل الجداول، بدون admin route |
| وصول Vercel/Supabase للفحص | توكن مرفوض / لا صلاحية | إعادة ربط بفريق zooka-ai1 ومشروع krzfrsaquvmwctsajhlm | P0 | المالك | — | OWN | `vercel project ls` يعرض chatbot |
| تكاملات حقيقية | 24 منفّذة، 0 متحققة حيًا | ربط حساب حقيقي واحد لكل مزود ذي أولوية | P1 | أسرار OAuth | متوسط | OWN | `/settings/integrations` تعرض `connected` + سطر `integration_audit` |
| كل ميزة FUNCTIONAL أو COMING SOON | جزئي | جرد الصفحات ووضع شارة "قريبًا" حيث لا يوجد backend | P1 | — | منخفض | ENG | لا زر يعطي خطأ أو لا يفعل شيئًا |
| الوكلاء: تشغيل فعلي | worker + 8 أدوات؛ اختيار النموذج مخزّن فقط | ربط اختيار النموذج بالتنفيذ | P1 | AI Gateway key | متوسط | ENG | مهمة وكيل تستخدم النموذج المختار (سجل `AgentExecution`) |
| إيقاف طارئ للوكلاء | غير موجود | علم على مستوى المنصة والمساحة يوقف worker | P1 | — | منخفض | ENG | تفعيل العلم يرفض كل مهمة جديدة خلال دورة واحدة |
| موافقات بشرية | `AgentApproval`, `StudioSpendApproval` | توحيد الواجهة | P2 | — | منخفض | ENG | كل عملية كتابة/إنفاق تنتظر موافقة |
| الاستوديو الإبداعي | gateway + adapters | مفتاح مزود | P1 | `RUNCOMFY_API_TOKEN` أو `FAL_KEY` | متوسط | OWN | `/api/studio/gateway` = `ready` |
| مركز التواصل الاجتماعي | TikTok/X، #191 Draft | مراجعة #191، تقويم محتوى | P2 | حسابات رسمية | منخفض | ENG | `/social` يعرض الحسابات الحية فقط |
| منصة المطورين | MCP + مفاتيح API | OpenAPI، rate-limit لكل مفتاح موثق | P2 | — | منخفض | ENG | `/api/openapi.json` صالح |
| أمان الحساب | OAuth + OTP | 2FA (TOTP) | P2 | — | متوسط | ENG | تسجيل دخول بحساب مفعّل 2FA يطلب الرمز |
| Feature flags | غير موجود | جدول أعلام + قراءة خادمية | P2 | — | منخفض | ENG | إخفاء ميزة من الإدارة بلا نشر |
| لوحة الإدارة | 19 قسمًا | ربط الأقسام ببيانات حقيقية فقط | P2 | — | منخفض | ENG | لا رقم ثابت في الكود |
| تجربة الجوال | bottom nav + PWA | اختبار Playwright على 390px لكل صفحة workspace | P2 | — | منخفض | ENG | لا تمرير أفقي في أي صفحة |
| lint نظيف | 5145 خطأ | تنظيف تدريجي | P3 | — | منخفض | ENG | `pnpm lint` = 0 |
| Meta Ads / OpticOdds / Polymarket | Meta عبر `lib/integrations/facebook` | لا تكرار؛ OpticOdds/Polymarket خارج نطاق المنتج | P3 | قرار منتج | — | OWN | — |
