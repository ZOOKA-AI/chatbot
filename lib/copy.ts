import type { Lang } from "@/lib/i18n";

export const GUEST_FREE_MESSAGES = 3;
export const DEFAULT_WORKSPACE_NAMES: Record<Lang, string> = {
  ar: "مساحة عمل جديدة",
  en: "New workspace",
};

export const copy = {
  ar: {
    upgrade: "ترقية",
    manageAccount: "إدارة الاشتراك",
    opening: "جارٍ الفتح…",
    signUp: "إنشاء حساب",
    logIn: "تسجيل الدخول",
    viewPlans: "عرض الخطط",
    paywallTitle: "تابع محادثتك مع Zooka AI",
    paywallBody:
      "لقد استخدمت رسائلك المجانية الثلاث. أنشئ حساباً مجانياً أو قم بالترقية لمتابعة الحوار وحفظ محادثاتك.",
    guestNotice: "تجربة الضيف: 3 رسائل مجانية",
    rename: "إعادة التسمية",
    renameTitle: "إعادة تسمية مساحة العمل",
    renamePlaceholder: "اسم مساحة العمل",
    save: "حفظ",
    cancel: "إلغاء",
    renameFailed: "تعذّر تغيير اسم مساحة العمل",
    workspaceSettings: "إعدادات مساحة العمل",
  },
  en: {
    upgrade: "Upgrade",
    manageAccount: "Manage account",
    opening: "Opening…",
    signUp: "Sign up",
    logIn: "Log in",
    viewPlans: "View plans",
    paywallTitle: "Continue your conversation with Zooka AI",
    paywallBody:
      "You've used your 3 free messages. Create a free account or upgrade to keep chatting and save your conversations.",
    guestNotice: "Guest preview: 3 free messages",
    rename: "Rename",
    renameTitle: "Rename workspace",
    renamePlaceholder: "Workspace name",
    save: "Save",
    cancel: "Cancel",
    renameFailed: "Unable to rename the workspace",
    workspaceSettings: "Workspace settings",
  },
} as const;
