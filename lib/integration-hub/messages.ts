const messages: Record<string, { ar: string; en: string }> = {
  SIGN_IN_REQUIRED: {
    ar: "سجّل الدخول بحسابك لقراءة حالة مساحتك.",
    en: "Sign in with a regular account to inspect your workspace.",
  },
  ADMIN_REQUIRED: {
    ar: "اختبار الاتصال يحتاج مالكاً أو مسؤولاً للمساحة.",
    en: "A workspace owner or admin must run connection tests.",
  },
  INTEGRATION_DATABASE_UNAVAILABLE: {
    ar: "تعذرت قراءة قاعدة التكاملات. راجع اتصال قاعدة البيانات وتطبيق ترحيل IntegrationCheck؛ الحالة غير معروفة.",
    en: "Integration database unavailable. Review database connectivity and the IntegrationCheck migration; status is unknown.",
  },
  WORKSPACE_DATABASE_UNAVAILABLE: {
    ar: "تعذرت قراءة بيانات المساحة؛ لا يعني هذا أن أرقام الاستخدام تساوي صفراً.",
    en: "Workspace data is unavailable. This does not mean zero usage.",
  },
  INVALID_ORIGIN: {
    ar: "أعد فتح التطبيق من نطاقه ثم جرّب الاختبار.",
    en: "Reopen the app on its own origin before testing.",
  },
  NO_WORKSPACE_CREDENTIAL: {
    ar: "لا يوجد اعتماد مخوّل لهذا الموصل في مساحتك. افتح إعدادات الربط.",
    en: "No authorized credential exists in this workspace. Open connection settings.",
  },
  CHECK_RATE_LIMIT: {
    ar: "انتظر دقيقة بين اختبارات الموصل نفسه؛ لم يُرسل اختبار جديد.",
    en: "Wait one minute between tests of the same connector. No new probe was sent.",
  },
  AUTH_REJECTED: {
    ar: "رفض المزوّد الاعتماد. أعد التفويض من إعدادات الربط.",
    en: "Provider rejected authorization. Reconnect through settings.",
  },
  CREDENTIAL_UNAVAILABLE: {
    ar: "تعذر استخدام الاعتماد المحفوظ؛ تحقق من التشفير وأعد التفويض.",
    en: "Stored credential could not be used. Review encryption configuration and reconnect.",
  },
  PERMISSION_DENIED: {
    ar: "الصلاحيات الحالية لا تسمح بالقراءة المختبرة. راجع الحد الأدنى المطلوب.",
    en: "Current permissions do not allow this read. Review required scopes.",
  },
  PROVIDER_UNREACHABLE: {
    ar: "تعذر الوصول إلى المزوّد ضمن مهلة الاختبار. لا يوجد إثبات اتصال.",
    en: "Provider could not be reached within the test timeout. Connectivity is not verified.",
  },
  PROVIDER_RATE_LIMIT: {
    ar: "المزوّد يحد الطلبات حالياً. انتظر قبل المحاولة مجدداً.",
    en: "Provider is rate limiting requests. Wait before retrying.",
  },
  PROVIDER_ERROR: {
    ar: "رفض المزوّد الاختبار؛ لم يُعتمد نجاحه.",
    en: "Provider rejected the probe; no success was certified.",
  },
  INVALID_RESPONSE: {
    ar: "استجابة المزوّد لا تطابق عقد الاختبار؛ HTTP 200 وحده لا يكفي.",
    en: "Provider response did not match the probe schema; HTTP 200 alone is insufficient.",
  },
  READ_OK: {
    ar: "نجح اختبار القراءة المحدد. لا يثبت هذا صلاحية النشر أو جميع الأدوات.",
    en: "The specified read succeeded. This does not certify publishing or all tools.",
  },
  CHECK_IN_PROGRESS: {
    ar: "حُجز اختبار لم يكتمل بعد، أو انقطع تنفيذه. انتظر دقيقة ثم أعد الفحص.",
    en: "A test was reserved but has not completed or was interrupted. Wait a minute before retrying.",
  },
  VERIFICATION_STALE: {
    ar: "انتهت صلاحية الإثبات السابق. نفّذ اختباراً جديداً لتحديثه.",
    en: "Previous verification expired. Run a new test to refresh it.",
  },
};
export function diagnosticMessage(code: string, lang: "ar" | "en") {
  const safe = /^[A-Z_]{2,50}$/.test(code) ? code : "SERVICE_UNAVAILABLE";
  return `[${safe}] ${messages[safe]?.[lang] ?? (lang === "ar" ? "تعذر التحقق؛ راجع الإعدادات والدليل قبل إعادة المحاولة." : "Verification unavailable; review settings and help before retrying.")}`;
}
