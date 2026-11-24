# IMPLEMENTATION ROADMAP

```mermaid
gantt
  title ZOOKA-AI roadmap (تقديري، يبدأ بعد موافقة المالك)
  dateFormat YYYY-MM-DD
  section P0 أمان
  #210 إصلاحات أمنية          :done, p01, 2026-11-22, 1d
  #213 تبعيات بلا ثغرات عالية  :done, p02, 2026-11-22, 1d
  تدوير مفتاح zk-mail (OWN)    :p03, 2026-11-23, 2d
  إعادة ربط Vercel/Supabase (OWN) :p04, 2026-11-23, 2d
  section P1 جوهر
  #212 بيئة موثّقة             :done, p11, 2026-11-22, 1d
  هجرة مرقّمة لجداول admin route :p12, after p04, 3d
  شارات COMING SOON            :p13, after p02, 3d
  إيقاف طارئ للوكلاء           :p14, after p13, 3d
  تشغيل النموذج المختار للوكيل  :p15, after p14, 5d
  أول تكامل متحقق حيًا         :p16, after p04, 5d
  section P2 توسّع
  مراجعة #191 social           :p21, after p13, 2d
  OpenAPI                      :p22, after p15, 5d
  2FA TOTP                     :p23, after p22, 5d
  Feature flags                :p24, after p14, 4d
  section P3
  تنظيف lint                   :p31, after p24, 10d
```

## المرحلة الأولى (التكرار الآمن الأول) — منفّذة كـ Draft PRs
| PR | النطاق | الحالة |
| --- | --- | --- |
| [#210](https://github.com/ZOOKA-AI/chatbot/pull/210) | ملاحظات أمنية + gate permissions + اختبار المتصفح | مفتوح للمراجعة |
| [#212](https://github.com/ZOOKA-AI/chatbot/pull/212) | `.env.example` كامل | مفتوح |
| [#213](https://github.com/ZOOKA-AI/chatbot/pull/213) | تبعيات + `lib/db/errors.ts` لـ drizzle 0.45 | Draft |
| هذا PR | وثائق `docs/product/` | Draft |

## المرحلة التالية المقترحة
P1-13 "شارات COMING SOON": جرد كل زر/صفحة في `/workspace/*` و`/settings/*` وربطه بحالة backend حقيقية (`lib/integrations/readiness.ts`, `live-status.ts`). لا يحتاج أسرارًا ولا هجرات.
