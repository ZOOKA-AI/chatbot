# SOCIAL-LINKS-VERIFICATION — التحقق من الحسابات الرسمية

المصدر الوحيد للروابط: `lib/social-accounts.ts` (من PR #191). لم تُنشأ صفحة مكررة؛ `/social` هي صفحة PR #191 نفسها.
PR #195 (مدموج) أضاف الحسابات الحية في الفوتر؛ الفوتر الجديد يحتفظ بنفس `FOOTER_ACCOUNTS` ولم يستبدل أي رابط.

| الحساب | الرابط | الحالة في الكود | نتيجة الفحص (2026-11-22) |
|---|---|---|---|
| X | x.com/zooka_ai | live | HTTP 200 |
| YouTube | @zooka_ai_official | live | HTTP 200، القناة بلا فيديوهات منشورة |
| Telegram | t.me/zooka_ai_official | live | HTTP 200 |
| Telegram Bot | t.me/zooka_ai_official_bot | live | HTTP 200 |
| LinkedIn | linkedin.com/company/zooka-ai | live | HTTP 200 |
| GitHub | github.com/ZOOKA-AI | live | HTTP 200 |
| DEV | dev.to/zoka_ai | live | HTTP 200 |
| Pinterest | pinterest.com/zookaai | live | HTTP 200 |
| Bluesky | zookaai.bsky.social | live | HTTP 200 |
| Discord | discord.gg/7ynqJxMZfQ | live | HTTP 200 |
| TikTok | @zooka.ai7 | live | HTTP 200 |
| Facebook | facebook.com/61596724862442 | live | تعذر التحقق الآلي (جدار تسجيل دخول). يحتاج تأكيد المالك |
| Reddit | u/Simple-Suggestion-26 | live | تعذر التحقق الآلي (حماية bots). يحتاج تأكيد المالك؛ الاسم لا يحمل العلامة |
| Instagram | — | pending | لا يظهر كحساب نشط |
| Google Developer (g.dev) | — | pending | لا يظهر في الصفوف؛ لكنه مذكور في `sameAs` بصفحة `/developer` القديمة — NEEDS APPROVAL للإزالة |

القاعدة المطبقة: `liveAccounts()` تعرض فقط الحسابات ذات `status: "live"` ورابط فعلي. `sameAs` في `/social` يُبنى من نفس القائمة.
