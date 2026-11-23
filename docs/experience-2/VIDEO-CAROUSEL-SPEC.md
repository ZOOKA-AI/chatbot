# VIDEO-CAROUSEL-SPEC

المكوّن: `components/tv/video-stream.tsx`.

| المتطلب | التنفيذ |
|---|---|
| RTL | `dir` حسب اللغة؛ أزرار السابق/التالي تنعكس |
| إيقاف عند hover/focus | يتوقف التقدم التلقائي عند `onMouseEnter`/`onFocus` ويستأنف عند `onMouseLeave`/`onBlur` |
| تنقل يدوي | زرا سابق/تالي بـ aria-label، والبطاقات روابط قابلة للتركيز بـ Tab |
| السحب | `scroll-snap` أفقي أصلي (يعمل باللمس) |
| Reduced motion | لا حركة تلقائية عند `prefers-reduced-motion: reduce` |
| Lazy loading | الصور المصغرة `loading="lazy"`؛ المشغل `preload="metadata"` (لا يُنزّل الفيديو كاملًا) |
| بلا صوت تلقائي | لا autoplay للفيديو إطلاقًا؛ التشغيل بيد المستخدم |
| إضافة فيديو دون كود | من `lib/tv/videos.ts` |
