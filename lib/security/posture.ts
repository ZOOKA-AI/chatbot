/**
 * Security posture — measured facts only.
 *
 * Every row here was produced by a real check (API read, session list, settings read)
 * on the date recorded in `measuredAt`. Nothing on this page is inferred, simulated or
 * projected: a row that was not measured is marked "unmeasured" instead of guessed.
 *
 * This module deliberately contains no secrets and no credentials.
 */

export type PostureState = "measured" | "needs_action" | "unmeasured";

export type PostureRow = {
  area: string;
  account: string;
  state: PostureState;
  detail: string;
  measuredAt: string;
};

export type ActionItem = {
  id: string;
  title: string;
  why: string;
  where: string;
};

export const POSTURE_MEASURED_AT = "2026-11-20";

export const postureRows: PostureRow[] = [
  {
    area: "Instagram",
    account: "royal_cleaning_uae",
    state: "needs_action",
    detail:
      "جلسة نشطة من Samsung Galaxy M12 — غزة، فلسطين. بقية الجلسات إماراتية (العين ودبي). ميتا ترفض الطرد من جهاز غير معتاد، فالخروج من الهاتف الأساسي.",
    measuredAt: "2026-11-19",
  },
  {
    area: "Facebook",
    account: "حلمى هارون",
    state: "measured",
    detail: "كل الجلسات في العين: Windows (الجهاز الحالي) وS25 Ultra وAndroid.",
    measuredAt: "2026-11-19",
  },
  {
    area: "Google",
    account: "zookaalmrzwq@gmail.com",
    state: "measured",
    detail:
      "التحقق بخطوتين مفعّل منذ 08/11/2025، ثلاثة مفاتيح مرور، عشرة رموز احتياطية، بريد استرداد helmyharoon8@gmail.com. الأجهزة: 5 جلسات Windows و3 أندرويد.",
    measuredAt: "2026-11-19",
  },
  {
    area: "Gmail",
    account: "helmyharoon8@gmail.com",
    state: "measured",
    detail:
      "لا عناوين تحويل، لا إعادة توجيه تلقائية، عنوان إرسال واحد، IMAP وPOP معطّلان، وفلتران فقط (إخراج Notion و@royalharoon.com من السبام).",
    measuredAt: "2026-11-19",
  },
  {
    area: "MoonPay",
    account: "helmyharoon8@gmail.com",
    state: "needs_action",
    detail:
      "الحساب أُنشئ من هاتف المالك نفسه (Chrome Mobile على SM-S938B، العين) في 2 نوفمبر، وتحقّقت هويته عبر MyTonWallet. البريد محظور ومحذوف، لكن الحساب نفسه ما زال قائمًا ويجب إغلاقه عند MoonPay.",
    measuredAt: "2026-11-20",
  },
  {
    area: "Telegram / WhatsApp",
    account: "الجلسات",
    state: "unmeasured",
    detail:
      "لم تُقرأ آليًا: أداة المتصفح لم تكن متاحة وقت الفحص. يُراجع يدويًا من الأجهزة ثم تُحدَّث الحالة هنا.",
    measuredAt: "2026-11-20",
  },
];

export const openActions: ActionItem[] = [
  {
    id: "instagram-gaza",
    title: "اطرد جلسة غزة من إنستجرام",
    why: "أي جهاز دخيل على الحساب يستطيع النشر وقراءة الرسائل باسم النشاط.",
    where:
      "من هاتف S25: مركز الحسابات ← كلمة السر والأمان ← الأماكن التي سجلت الدخول منها ← Galaxy M12 ← تسجيل الخروج، ثم تغيير كلمة السر وتفعيل التحقق بخطوتين.",
  },
  {
    id: "moonpay-close",
    title: "أغلق حساب MoonPay",
    why: "حساب موثّق الهوية باسمك يعني مسؤولية قائمة، وحذف البريد لا يحذفه.",
    where: "moonpay.com ← نسيت كلمة المرور بنفس البريد ← الدخول ← إغلاق الحساب، أو مراسلة الدعم.",
  },
  {
    id: "google-permissions",
    title: "راجع تطبيقات الوصول في جوجل",
    why: "25 تطبيقًا مرتبطًا، منها اسم غامض Social Media Connector وClaude for Gmail بصلاحية قراءة البريد.",
    where: "myaccount.google.com/connections ← أزل ما لا تستخدمه، وابدأ بالاسم الغامض.",
  },
  {
    id: "telegram-whatsapp",
    title: "أنهِ الجلسات الأخرى في تليجرام وواتساب",
    why: "جهاز مرتبط واحد يقرأ المحادثات كاملة.",
    where: "تليجرام: الإعدادات ← الأجهزة. واتساب: الإعدادات ← الأجهزة المرتبطة ← تسجيل الخروج من كل الأجهزة.",
  },
];

/** إصدار تطبيق صياد المسلَّم — البصمة تخص الملف نفسه، لا وصفًا عنه. */
export const sayyadRelease = {
  version: "1.1",
  versionCode: 2,
  packageName: "com.haroon.sayyad",
  apkBytes: 34085,
  sha256: "e587df15b80d7f98616e2237064df70ac00b9bf6fa652e637f5b71b90602ef5d",
  downloadUrl:
    "https://base44.app/api/apps/6a59a3602d56ecc389d18e3d/files/mp/public/6a59a3602d56ecc389d18e3d/de4b767ec_sayyad-v11.zip",
  capabilities: [
    "يقطع شبكة أي تطبيق تحجزه ويسجّل الوجهة والمنفذ والوقت وحالة الشاشة.",
    "يضع كل تطبيق جديد تثبّته في الحجز تلقائيًا حتى تقرر.",
    "إشعار واهتزاز لحظة كل صيد، وسجل قابل للتصدير CSV.",
    "حارس عرض يكشف التكبير وخدمات إمكانية الوصول التي تغيّر حجم الكتابة.",
  ],
  limits: [
    "لا يحتاج روت، ولذلك لا يقتل عمليات التطبيقات ولا يقرأ محتوى الشاشة.",
    "لا يغيّر إعداد التكبير في النظام: يكشفه ويفتح لك مكان إيقافه.",
    "لا يرسل أي بيانات لأي سيرفر: كل شيء في قاعدة بيانات محلية على الجهاز.",
  ],
} as const;

export const auditReportUrl =
  "https://base44.app/api/apps/6a59a3602d56ecc389d18e3d/files/mp/public/6a59a3602d56ecc389d18e3d/4767f098a_royal_full_audit_20261120.html";

export function stateLabel(state: PostureState): string {
  if (state === "needs_action") return "يحتاج إجراء";
  if (state === "measured") return "مقيس وسليم";
  return "غير مقيس";
}
