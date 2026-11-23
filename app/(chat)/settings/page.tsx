import {
  Bell,
  Code2,
  CreditCard,
  Database,
  Eye,
  KeyRound,
  Languages,
  LayoutGrid,
  Lock,
  Palette,
  Plug,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeChoice } from "@/components/settings/theme-choice";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "الإعدادات",
  robots: { index: false },
};

type Status = "available" | "limited" | "soon";

interface Section {
  id: string;
  icon: typeof UserRound;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  status: Status;
  links?: { href: string; ar: string; en: string }[];
  inline?: "theme" | "language";
}

/**
 * The 14 settings sections from the Experience 2.0 brief, each mapped to the
 * page that already does the job. Nothing here re-implements an existing
 * page; sections without a backing feature say so instead of faking one.
 */
const SECTIONS: Section[] = [
  {
    id: "profile",
    icon: UserRound,
    title: { ar: "الملف الشخصي", en: "Profile" },
    body: {
      ar: "الاسم والصورة يأتيان حاليًا من طريقة الدخول (Google أو Facebook أو الهاتف). محرر الملف الشخصي قيد التخطيط.",
      en: "Name and picture currently come from your sign-in method (Google, Facebook or phone). A profile editor is planned.",
    },
    status: "soon",
  },
  {
    id: "account",
    icon: UserRound,
    title: { ar: "الحساب", en: "Account" },
    body: {
      ar: "بيانات الحساب وحذفه نهائيًا مع تأكيد قبل التنفيذ.",
      en: "Account data and permanent deletion, with confirmation before it runs.",
    },
    status: "available",
    links: [
      {
        href: "/settings/account",
        ar: "إعدادات الحساب",
        en: "Account settings",
      },
    ],
  },
  {
    id: "security",
    icon: Lock,
    title: { ar: "الأمان", en: "Security" },
    body: {
      ar: "تغيير كلمة المرور عبر رابط الاستعادة، وصفحة فحوص الأمان لمساحة العمل. التحقق بخطوتين وسجل الجلسات غير متاحين بعد.",
      en: "Change your password through the reset link, and the workspace security checks page. Two-factor sign-in and session history are not available yet.",
    },
    status: "limited",
    links: [
      {
        href: "/forgot-password",
        ar: "تغيير كلمة المرور",
        en: "Change password",
      },
      { href: "/workspace/security", ar: "فحوص الأمان", en: "Security checks" },
    ],
  },
  {
    id: "appearance",
    icon: Palette,
    title: { ar: "المظهر", en: "Appearance" },
    body: {
      ar: "اختر الوضع الداكن أو الفاتح أو حسب إعداد جهازك.",
      en: "Choose dark, light or follow your device.",
    },
    status: "available",
    inline: "theme",
  },
  {
    id: "language",
    icon: Languages,
    title: { ar: "اللغة", en: "Language" },
    body: {
      ar: "العربية (من اليمين لليسار) أو الإنجليزية.",
      en: "Arabic (right to left) or English.",
    },
    status: "available",
    inline: "language",
  },
  {
    id: "notifications",
    icon: Bell,
    title: { ar: "الإشعارات", en: "Notifications" },
    body: {
      ar: "تفضيلات الإشعارات غير متاحة بعد.",
      en: "Notification preferences are not available yet.",
    },
    status: "soon",
  },
  {
    id: "workspace",
    icon: LayoutGrid,
    title: { ar: "مساحة العمل", en: "Workspace" },
    body: {
      ar: "اسم المساحة، التبديل بين المساحات، والباقة.",
      en: "Workspace name, switching workspaces and the plan.",
    },
    status: "available",
    links: [{ href: "/workspace", ar: "مساحة العمل", en: "Workspace" }],
  },
  {
    id: "team",
    icon: Users,
    title: { ar: "الفريق", en: "Team" },
    body: {
      ar: "دعوة الأعضاء وتغيير أدوارهم.",
      en: "Invite members and change their roles.",
    },
    status: "available",
    links: [
      { href: "/workspace", ar: "الأعضاء والدعوات", en: "Members and invites" },
    ],
  },
  {
    id: "integrations",
    icon: Plug,
    title: { ar: "التكاملات", en: "Integrations" },
    body: {
      ar: "الحسابات المتصلة، الربط وإعادة الربط والفصل، واختبار الاتصال — بحالتها الحقيقية.",
      en: "Connected accounts, connect, reconnect, disconnect and connection tests — with their real status.",
    },
    status: "available",
    links: [
      { href: "/settings/integrations", ar: "التكاملات", en: "Integrations" },
    ],
  },
  {
    id: "developer",
    icon: Code2,
    title: { ar: "المطور", en: "Developer" },
    body: {
      ar: "ربط MCP وكتالوج الأدوات. الويب هوك العام غير متاح بعد.",
      en: "MCP connection and the tool catalog. Public webhooks are not available yet.",
    },
    status: "limited",
    links: [
      { href: "/settings/mcp", ar: "ربط MCP", en: "MCP connection" },
      { href: "/settings/usage", ar: "الاستخدام", en: "Usage" },
    ],
  },
  {
    id: "api-keys",
    icon: KeyRound,
    title: { ar: "مفاتيح API", en: "API keys" },
    body: {
      ar: "إنشاء مفاتيح MCP وإلغاؤها لمساحة عملك.",
      en: "Create and revoke MCP keys for your workspace.",
    },
    status: "available",
    links: [{ href: "/settings/mcp", ar: "مفاتيح MCP", en: "MCP keys" }],
  },
  {
    id: "billing",
    icon: CreditCard,
    title: { ar: "الفوترة", en: "Billing" },
    body: {
      ar: "الباقة الحالية، الترقية أو الإلغاء، والاستهلاك.",
      en: "Current plan, upgrade or cancel, and usage.",
    },
    status: "available",
    links: [
      { href: "/workspace/billing", ar: "الباقة", en: "Plan" },
      {
        href: "/settings/usage",
        ar: "الاستخدام والحدود",
        en: "Usage and limits",
      },
    ],
  },
  {
    id: "privacy",
    icon: Eye,
    title: { ar: "الخصوصية", en: "Privacy" },
    body: {
      ar: "سياسة الخصوصية وسياسة ملفات تعريف الارتباط.",
      en: "Privacy policy and cookie policy.",
    },
    status: "limited",
    links: [
      { href: "/privacy", ar: "الخصوصية", en: "Privacy" },
      { href: "/cookies", ar: "ملفات الارتباط", en: "Cookies" },
    ],
  },
  {
    id: "data",
    icon: Database,
    title: { ar: "إدارة البيانات", en: "Data management" },
    body: {
      ar: "بيانات العملاء المحتملين، وحذف الحساب وكل بياناته (يطلب تأكيدًا ولا يمكن التراجع عنه).",
      en: "Lead data, and deleting the account with all its data (asks for confirmation and cannot be undone).",
    },
    status: "limited",
    links: [
      { href: "/settings/leads", ar: "العملاء المحتملون", en: "Leads" },
      { href: "/settings/account", ar: "حذف الحساب", en: "Delete account" },
    ],
  },
];

const STATUS_LABEL: Record<
  Status,
  { ar: string; en: string; className: string }
> = {
  available: {
    ar: "متاح",
    en: "Available",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  limited: {
    ar: "جزئي",
    en: "Limited",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  soon: {
    ar: "قريبًا",
    en: "Coming soon",
    className: "bg-muted text-muted-foreground",
  },
};

export default async function SettingsHubPage() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
    redirect("/login");
  }
  const lang = await getLang();
  const ar = lang === "ar";

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-5 pb-28 md:p-8"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {ar ? "الإعدادات" : "Settings"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar
            ? "كل إعدادات حسابك ومساحة عملك في مكان واحد. كل قسم يوضح ما هو متاح فعلًا اليوم."
            : "Every account and workspace setting in one place. Each section says what is actually available today."}
        </p>
      </header>

      <nav
        aria-label={ar ? "أقسام الإعدادات" : "Settings sections"}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden"
      >
        {SECTIONS.map((section) => (
          <a
            className="border-border inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-xs"
            href={`#${section.id}`}
            key={section.id}
          >
            {section.title[lang]}
          </a>
        ))}
      </nav>

      <ul className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const status = STATUS_LABEL[section.status];
          return (
            <li
              className="border-border bg-card flex scroll-mt-20 flex-col gap-3 rounded-2xl border p-5"
              id={section.id}
              key={section.id}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="text-lg font-medium">{section.title[lang]}</h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                >
                  {status[lang]}
                </span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {section.body[lang]}
              </p>
              {section.inline === "theme" ? <ThemeChoice lang={lang} /> : null}
              {section.inline === "language" ? (
                <LanguageToggle
                  className="border-border hover:bg-muted inline-flex min-h-11 w-fit items-center rounded-lg border px-4 text-sm transition-colors"
                  lang={lang}
                />
              ) : null}
              {section.links ? (
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {section.links.map((link) => (
                    <Link
                      className="border-border hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-4 text-sm transition-colors"
                      href={link.href}
                      key={link.href + link.en}
                    >
                      {ar ? link.ar : link.en}
                    </Link>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck aria-hidden="true" className="size-4" />
        {ar
          ? "الإجراءات التي لا يمكن التراجع عنها، مثل حذف الحساب، تطلب تأكيدًا قبل التنفيذ."
          : "Actions that cannot be undone, such as deleting the account, ask for confirmation first."}
      </p>
    </main>
  );
}
