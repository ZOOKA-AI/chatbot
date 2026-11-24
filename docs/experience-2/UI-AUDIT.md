# UI-AUDIT — فحص الواجهة قبل التعديل

تاريخ الفحص: 2026-11-22. المصدر: الإنتاج https://zooka-ai.com (قراءة فقط) + كود `main` (d7c637e) + فرع PR #191.
لقطات الإنتاج: `docs/experience-2/screens/prod-*` (منسوخة من جلسة الفحص).

التصنيف: EXISTING (موجود) · WORKING (يعمل) · BROKEN (معطل) · MISSING (غير موجود) · NEEDS IMPROVEMENT.

| العنصر | الحالة | الدليل |
|---|---|---|
| الصفحة الرئيسية `/` (Hero، Compare، الأسعار) | EXISTING / WORKING | `components/marketing/landing-page.tsx`؛ لقطة prod-home-desktop.png |
| تسجيل الدخول `/login` و`/register` | EXISTING / WORKING | `app/(auth)/`؛ لقطة prod-login-*.png. لم يُعدَّل |
| قائمة الجوال في الهيدر | NEEDS IMPROVEMENT | لا تُغلق بزر Escape ولا تعيد التركيز؛ أهداف لمس أصغر من 24px (16 هدفًا مقاسة) |
| الهيدر في الوضع الفاتح | BROKEN | يبقى داكنًا في light mode — prod-home-en-light.png |
| `/support`، `/tv`، `/help`، `/status`، `/changelog` | MISSING | استجابة 404 على الإنتاج |
| `/social` | EXISTING في PR #191 فقط | 404 على الإنتاج لأن #191 غير مدموج |
| الفوتر | NEEDS IMPROVEMENT | لا أعمدة PRODUCT/DEVELOPERS/COMPANY/SUPPORT/LEGAL، لا محدد لغة/سمة. روابط الحسابات من PR #195 (مدموج) سليمة وأُبقيت |
| مبدّل السمة | EXISTING جزئيًا | `next-themes` مثبت؛ لا زر عام في الصفحات التسويقية |
| شريط التنقل السفلي للجوال | EXISTING / WORKING | `components/mobile-bottom-nav.tsx` (5 عناصر، مخفي في شاشة المحادثة) |
| الشريط الجانبي (سطح المكتب) | EXISTING / WORKING / NEEDS IMPROVEMENT | `components/app-sidebar.tsx` قابل للطي؛ كان ينقصه الدعم وAI TV والحسابات الرسمية ومركز الإعدادات |
| صفحة الإعدادات `/settings` | MISSING (المركز) | صفحات فرعية موجودة: account, integrations, mcp, usage, leads؛ لا صفحة جامعة |
| حذف الحساب | EXISTING / WORKING | `DeleteAccountButton` مع AlertDialog تأكيد |
| مفاتيح API | EXISTING بصيغة MCP | `lib/db/mcp-keys.ts` بادئة `zk_mcp_`؛ 7 أدوات عبر `/api/mcp` (Bearer) |
| صفحة `/developer` | EXISTING | صفحة شخصية للمطوّر، ليست توثيق API |
| التكاملات | EXISTING / WORKING | 41 مزودًا؛ أغلبها available، وبعضها beta/coming_soon (WhatsApp Business، Google Business، Plaid، Amadeus، Booking، Namecheap، Agora؛ Google Maps beta) |
| الفيديو | EXISTING | `public/videos/zooka-demo.mp4` (28 ثانية، بلا صوت) |
| شريط الكوكيز | NEEDS IMPROVEMENT | يغطي جزءًا من المحتوى على الجوال (prod-home-mobile.png). لم يُعدَّل في هذا الفرع |
| شعار ZOOKA-AI | EXISTING | `public/brand/*` — استُخدم كما هو دون استبدال |

## ما لم يُلمس عمدًا
تسجيل الدخول، الـ Hero، قاعدة البيانات، مزودو التكاملات، الدفع، صلاحيات الأدمن.
