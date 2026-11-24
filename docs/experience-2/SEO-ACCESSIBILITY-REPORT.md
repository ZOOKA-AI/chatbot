# SEO-ACCESSIBILITY-REPORT

## SEO
- `app/sitemap.ts`: أُضيف `/tv` و`/support`.
- `/support`: FAQPage JSON-LD.
- `/tv`: VideoObject JSON-LD للفيديوهات `published` فقط — فيديوهات review لا تُعلن لمحركات البحث.
- `sameAs` في `/social`: الحسابات live فقط.
- ملاحظة: `/developer` يذكر g.dev في `sameAs` بينما الحساب pending — NEEDS APPROVAL.

## Accessibility
- قائمة الجوال: Escape + إرجاع التركيز + `aria-expanded`/`aria-controls`.
- أهداف لمس 44px في العناصر الجديدة والمعدلة.
- مبدّل السمة: `aria-pressed` لكل خيار داخل `fieldset`.
- الفيديو: ترجمات VTT عربية وإنجليزية، `preload="metadata"`، بلا تشغيل تلقائي.
- احترام `prefers-reduced-motion` في الشريط.
- RTL: `dir` على الحاويات، عزل النص اللاتيني.
