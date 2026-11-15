import type { Lang } from "@/lib/i18n";

/**
 * Interface text for both languages, in one place.
 *
 * Kept as data rather than inline strings so the same key cannot drift between
 * Arabic and English, and so a missing translation is a type error instead of a
 * half-translated screen. Only labels live here: every number on the screen is
 * read from the API, because a hardcoded figure is a lie waiting to age.
 */
export type Copy = {
  title: string;
  subtitle: string;
  tabs: { history: string; approvals: string; create: string };
  refresh: string;
  empty: { tasks: string; approvals: string; history: string };
  paging: { loadMore: string; loadingMore: string; allLoaded: string; shown: string };
  columns: {
    task: string;
    status: string;
    agent: string;
    created: string;
    claimed: string;
    reported: string;
    evidence: string;
  };
  status: Record<string, string>;
  actions: {
    view: string;
    cancel: string;
    retry: string;
    approve: string;
    reject: string;
    close: string;
    submit: string;
    confirm: string;
  };
  form: {
    title: string;
    instruction: string;
    priority: string;
    approvalRequired: string;
    approvalRequiredHint: string;
    priorityValue: Record<string, string>;
  };
  confirm: {
    cancelTitle: string;
    cancelBody: string;
    retryTitle: string;
    retryBody: string;
    approveTitle: string;
    approveBody: string;
    rejectTitle: string;
    rejectBody: string;
    reasonLabel: string;
    reasonPlaceholder: string;
  };
  approval: {
    requestedBy: string;
    reason: string;
    task: string;
    pendingOnly: string;
    decidedBy: string;
  };
  detail: { timestamps: string; error: string; history: string; org: string };
  errors: Record<string, string>;
  loading: string;
  saving: string;
  readOnly: string;
  resultOk: { created: string; cancelled: string; retried: string; approved: string; rejected: string };
};

const en: Copy = {
  title: "Commander",
  subtitle: "Execution history, approvals and task control for this workspace.",
  paging: {
    loadMore: "Load more",
    loadingMore: "Loading…",
    allLoaded: "End of history.",
    shown: "tasks shown",
  },
  tabs: { history: "Execution history", approvals: "Approvals", create: "New task" },
  refresh: "Refresh",
  empty: {
    tasks: "No tasks yet. Create one to see it here.",
    approvals: "No approvals are waiting.",
    history: "No recorded events for this task.",
  },
  columns: {
    task: "Task",
    status: "Status",
    agent: "Agent",
    created: "Created",
    claimed: "Started",
    reported: "Finished",
    evidence: "Result or error",
  },
  status: {
    pending: "Waiting",
    in_progress: "Running",
    completed: "Completed",
    failed: "Failed",
    blocked: "Blocked",
    cancelled: "Cancelled",
    approved: "Approved",
    rejected: "Rejected",
  },
  actions: {
    view: "Details",
    cancel: "Cancel",
    retry: "Retry",
    approve: "Approve",
    reject: "Reject",
    close: "Close",
    submit: "Create task",
    confirm: "Confirm",
  },
  form: {
    title: "Title",
    instruction: "Instruction",
    priority: "Priority",
    approvalRequired: "Needs approval before running",
    approvalRequiredHint: "The agent cannot execute this until a human approves it.",
    priorityValue: { low: "Low", normal: "Normal", high: "High" },
  },
  confirm: {
    cancelTitle: "Cancel this task?",
    cancelBody: "The agent stops immediately and cannot report a result afterwards.",
    retryTitle: "Retry this task?",
    retryBody: "The task returns to the queue and any agent may claim it again.",
    approveTitle: "Approve this request?",
    approveBody: "Approving authorises the agent to perform the restricted action.",
    rejectTitle: "Reject this request?",
    rejectBody: "The action will not be allowed to run. The agent will be refused.",
    reasonLabel: "Reason",
    reasonPlaceholder: "Why?",
  },
  approval: {
    requestedBy: "Requested by",
    reason: "Reason",
    task: "Task",
    pendingOnly: "Only pending requests can be decided.",
    decidedBy: "Decided by",
  },
  detail: {
    timestamps: "Timeline",
    error: "Execution error",
    history: "Recorded events",
    org: "Organisation",
  },
  errors: {
    unauthorized: "Your session ended. Sign in again.",
    forbidden: "Your role does not allow this action.",
    owner_or_admin_required: "Only an owner or admin can do this.",
    task_not_found: "That task no longer exists in this workspace.",
    not_retryable: "Only failed or cancelled tasks can be retried.",
    approval_rejected: "This task was rejected. Create a new task instead of retrying it.",
    invalid_body: "Check the fields and try again.",
    network: "Could not reach the server. Try again.",
    unknown: "Something went wrong.",
  },
  loading: "Loading",
  saving: "Working",
  readOnly: "Read only: your role cannot change tasks.",
  resultOk: {
    created: "Task created.",
    cancelled: "Task cancelled.",
    retried: "Task returned to the queue.",
    approved: "Approved.",
    rejected: "Rejected.",
  },
};

const ar: Copy = {
  title: "القائد",
  subtitle: "سجل التنفيذ والموافقات والتحكم بمهام هذه المساحة.",
  paging: {
    loadMore: "تحميل المزيد",
    loadingMore: "جارٍ التحميل…",
    allLoaded: "نهاية السجل.",
    shown: "مهمة معروضة",
  },
  tabs: { history: "سجل التنفيذ", approvals: "الموافقات", create: "مهمة جديدة" },
  refresh: "تحديث",
  empty: {
    tasks: "لا توجد مهام بعد. أنشئ مهمة لتظهر هنا.",
    approvals: "لا توجد موافقات في الانتظار.",
    history: "لا أحداث مسجلة لهذه المهمة.",
  },
  columns: {
    task: "المهمة",
    status: "الحالة",
    agent: "الوكيل",
    created: "أُنشئت",
    claimed: "بدأت",
    reported: "انتهت",
    evidence: "النتيجة أو الخطأ",
  },
  status: {
    pending: "في الانتظار",
    in_progress: "قيد التنفيذ",
    completed: "مكتملة",
    failed: "فاشلة",
    blocked: "متوقفة",
    cancelled: "ملغاة",
    approved: "مٌوافق عليها",
    rejected: "مرفوضة",
  },
  actions: {
    view: "التفاصيل",
    cancel: "إلغاء",
    retry: "إعادة المحاولة",
    approve: "موافقة",
    reject: "رفض",
    close: "إغلاق",
    submit: "إنشاء المهمة",
    confirm: "تأكيد",
  },
  form: {
    title: "العنوان",
    instruction: "التعليمات",
    priority: "الأولوية",
    approvalRequired: "تحتاج موافقة قبل التنفيذ",
    approvalRequiredHint: "لا يستطيع الوكيل تنفيذها حتى يوافق إنسان.",
    priorityValue: { low: "منخفضة", normal: "عادية", high: "عالية" },
  },
  confirm: {
    cancelTitle: "إلغاء هذه المهمة؟",
    cancelBody: "سيتوقف الوكيل فورًا ولن يستطيع تسجيل نتيجة بعدها.",
    retryTitle: "إعادة محاولة هذه المهمة؟",
    retryBody: "تعود المهمة إلى قائمة الانتظار ويمكن لأي وكيل استحواذها من جديد.",
    approveTitle: "الموافقة على هذا الطلب؟",
    approveBody: "الموافقة تسمح للوكيل بتنفيذ الإجراء المقيّد.",
    rejectTitle: "رفض هذا الطلب؟",
    rejectBody: "لن يُسمح بتنفيذ الإجراء، وسيُرفض الوكيل.",
    reasonLabel: "السبب",
    reasonPlaceholder: "لماذا؟",
  },
  approval: {
    requestedBy: "طُلب بواسطة",
    reason: "السبب",
    task: "المهمة",
    pendingOnly: "يمكن البتّ في الطلبات المعلّقة فقط.",
    decidedBy: "بُتّت بواسطة",
  },
  detail: {
    timestamps: "الخط الزمني",
    error: "خطأ التنفيذ",
    history: "الأحداث المسجلة",
    org: "المساحة",
  },
  errors: {
    unauthorized: "انتهت الجلسة. سجّل الدخول من جديد.",
    forbidden: "صلاحيتك لا تسمح بهذا الإجراء.",
    owner_or_admin_required: "هذا الإجراء للمالك أو المشرف فقط.",
    task_not_found: "هذه المهمة لم تعد موجودة في مساحتك.",
    not_retryable: "يمكن إعادة محاولة المهام الفاشلة أو الملغاة فقط.",
    approval_rejected: "هذه المهمة مرفوضة. أنشئ مهمة جديدة بدل إعادة المحاولة.",
    invalid_body: "تحقق من الحقول وحاول مرة أخرى.",
    network: "تعذر الوصول إلى الخادم. حاول مرة أخرى.",
    unknown: "حدث خطأ غير متوقع.",
  },
  loading: "جارٍ التحميل",
  saving: "جارٍ التنفيذ",
  readOnly: "قراءة فقط: صلاحيتك لا تسمح بتعديل المهام.",
  resultOk: {
    created: "أُنشئت المهمة.",
    cancelled: "أُلغيت المهمة.",
    retried: "أُعيدت المهمة إلى قائمة الانتظار.",
    approved: "تمت الموافقة.",
    rejected: "تم الرفض.",
  },
};

const COPY: Record<Lang, Copy> = { ar, en };

export function copyOf(lang: Lang): Copy {
  return COPY[lang] ?? COPY.ar;
}

export function statusLabel(lang: Lang, status: string): string {
  return copyOf(lang).status[status] ?? status;
}

export function errorText(lang: Lang, code: string | undefined): string {
  const copy = copyOf(lang);
  if (!code) return copy.errors.unknown;
  return copy.errors[code] ?? copy.errors.unknown;
}

/** Dates in the reader's language, with no locale-dependent surprise for tests. */
export function formatStamp(value: Date | string | null | undefined, lang: Lang): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
}
