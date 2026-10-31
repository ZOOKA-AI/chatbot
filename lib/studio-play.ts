export const winLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
export type Mark = "X" | "O" | null;
export function gameResult(board: Mark[]): "X" | "O" | "draw" | null {
  for (const [a, b, c] of winLines)
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return board[a];
  return board.every(Boolean) ? "draw" : null;
}
export const creativeChallenges = [
  "صمّم صفحة لمكتبة صغيرة بلونين فقط، واجعل العنوان يحكي قصتها.",
  "اكتب ثلاث نهايات مختلفة لقصة تبدأ برسالة وصلت بعد عشر سنوات.",
  "حوّل خدمة يومية مملة إلى تجربة ممتعة: ارسم ثلاث شاشات على ورقة.",
  "ابتكر اسم منتج عربي من كلمتين، ثم صمّم له صفحة من أحد القوالب.",
  "صمّم دعوة لفعالية مجانية؛ اجعل الموعد والمكان واضحين دون صور.",
  "اكتب وصفاً لمشروعك في 12 كلمة، ثم جرّب تحويله لعنوان موقع.",
];
export const quizQuestions = [
  {
    question: "أي عنصر HTML يُستخدم لعنوان الصفحة الرئيسي؟",
    options: ["h1", "p", "footer"],
    answer: 0,
    explanation: "h1 يعرّف العنوان الرئيسي ويساعد على تنظيم المحتوى.",
  },
  {
    question: "ما الذي لا يجب وضعه في كود المتصفح العام؟",
    options: ["لون الخلفية", "مفتاح API سري", "عنوان الصفحة"],
    answer: 1,
    explanation:
      "المفاتيح السرية تبقى على الخادم ولا تدخل المستودع أو التخزين المحلي.",
  },
  {
    question: "ماذا يضيف التصميم المتجاوب؟",
    options: ["زيادة الملفات دائماً", "شراء دومين", "التكيّف مع أحجام الشاشات"],
    answer: 2,
    explanation: "التصميم المتجاوب يجعل التجربة مناسبة للجوال والشاشات الأكبر.",
  },
  {
    question: "هل ظهور أيقونة موصل يعني أنه متصل؟",
    options: [
      "لا، يلزم تنفيذ وتفويض واختبار",
      "نعم دائماً",
      "فقط إذا كانت ملونة",
    ],
    answer: 0,
    explanation: "وجود الأيقونة ليس تفويضاً، ولا يثبت أن عمليات الخدمة تعمل.",
  },
  {
    question: "ما أفضل خطوة قبل تعديل مشروع مهم؟",
    options: [
      "حذف النسخة القديمة",
      "نسخة احتياطية قابلة للاستعادة",
      "تغيير اسمه فقط",
    ],
    answer: 1,
    explanation: "احفظ نسخة احتياطية واختبر استعادتها قبل التغييرات المؤثرة.",
  },
] as const;

const shell = (title: string, body: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#171e28;color:#eef4ff;font:17px/1.9 system-ui}main{max-width:900px;margin:auto;padding:35px 24px}h1{font-size:clamp(32px,6vw,60px);line-height:1.4}a{color:#afd8ff}article,details{background:#253246;border:1px solid #465a77;border-radius:18px;padding:22px;margin:16px 0}summary{cursor:pointer;font-weight:600}small{color:#b7c7de}nav{display:flex;gap:20px;flex-wrap:wrap}input,select,textarea{font:inherit;max-width:100%;padding:10px;border-radius:8px}footer{margin-top:45px;color:#a6b8cf;font-size:13px}</style><main>${body}<footer>قالب توضيحي قابل للتعديل — استبدل البيانات قبل النشر. لا توجد خدمات خارجية متصلة.</footer></main></html>`;
export const creativeTemplates = [
  {
    id: "quiz",
    title: "اختبار تفاعلي بسيط",
    category: "تعليم وترفيه",
    description: "أسئلة وإجابات قابلة للكشف دون JavaScript أو تتبع.",
    color: "#c6dbff",
    html: shell(
      "اختبر معلوماتك",
      `<nav>مساحة التعلم / اختبار صغير</nav><h1>فضولك، أول خطوة.</h1><p>فكّر في الإجابة ثم افتح البطاقة. لا يوجد تصحيح آلي أو جمع بيانات.</p><details><summary>ما اللغة المستخدمة لتنسيق صفحات الويب؟</summary><p>CSS — تتحكم بالألوان والأبعاد والتخطيط.</p></details><details><summary>كيف تحمي مفاتيح API؟</summary><p>احتفظ بالمفاتيح السرية على الخادم، لا في كود المتصفح.</p></details><details><summary>هل ظهور التكامل يعني أنه يعمل؟</summary><p>لا. تحتاج تنفيذ العمليات والتفويض واختبار الاتصال.</p></details>`,
    ),
  },
  {
    id: "event",
    title: "دعوة فعالية إبداعية",
    category: "مجتمع",
    description: "موعد وبرنامج وأسئلة شائعة تفتح بالنقر؛ لا تسجيل وهمي.",
    color: "#f4c9c1",
    html: shell(
      "ملتقى الأفكار",
      `<nav>ملتقى الأفكار / دعوة توضيحية</nav><h1>أفكار تلتقي.<br>ومشاريع تبدأ.</h1><p>فعالية نموذجية — استبدل الموعد والمكان قبل إرسال الدعوة.</p><article><h2>الموعد والمكان</h2><p>ضع هنا اليوم والتاريخ والمدينة.</p></article><article><h2>البرنامج</h2><p>16:00 تعارف · 17:00 ورشة أفكار · 18:00 عرض المشاريع</p></article><details><summary>هل أحتاج خبرة؟</summary><p>اكتب هنا شروط المشاركة الفعلية.</p></details><details><summary>كيف أحجز؟</summary><p>أضف وسيلة الحجز الرسمية بعد إعدادها. هذا القالب لا يجمع حجوزات.</p></details>`,
    ),
  },
  {
    id: "menu",
    title: "قائمة مقهى رقمية",
    category: "أعمال محلية",
    description: "قائمة منظمة وروابط أقسام وأسئلة شائعة، بلا طلبات غير متصلة.",
    color: "#e1dbb3",
    html: shell(
      "مقهى ورق",
      `<nav><b>ورق.</b><a href="#coffee">القهوة</a><a href="#dessert">الحلوى</a></nav><h1>استراحة تستحقها.</h1><p>قائمة توضيحية — لا توجد طلبات أو مدفوعات متصلة.</p><section id="coffee"><h2>القهوة</h2><article><h3>قهوة اليوم</h3><p>مذاق متوازن وبداية هادئة.</p><small>ضع السعر الفعلي هنا</small></article><article><h3>لاتيه</h3><p>إسبريسو وحليب مخملي.</p><small>ضع السعر الفعلي هنا</small></article></section><section id="dessert"><h2>الحلوى</h2><article><h3>كيك منزلي</h3><p>أضف وصف المكونات ومعلومات الحساسية.</p></article></section><details><summary>معلومات الحساسية</summary><p>تحقق من المكونات الفعلية قبل نشر القائمة.</p></details>`,
    ),
  },
];
