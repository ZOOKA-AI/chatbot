/**
 * The command center's sections, in the order an operator needs them.
 *
 * One list shared by the navigation and by the pages themselves, so a section can never exist in the
 * menu without a page behind it. `ready` marks the ones that read real data today; a section that is
 * still a stub says so on its own screen rather than pretending to be live.
 */
export type AdminNavItem = {
  href: string;
  labelAr: string;
  labelEn: string;
  group: "command" | "platform" | "operations" | "governance";
  ready: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", labelAr: "نظرة شاملة", labelEn: "Overview", group: "command", ready: true },
  { href: "/admin/command", labelAr: "الوكيل الأعلى", labelEn: "Super admin agent", group: "command", ready: true },
  { href: "/admin/system-map", labelAr: "خريطة النظام", labelEn: "System map", group: "command", ready: true },
  { href: "/admin/incidents", labelAr: "الأعطال والإصلاح", labelEn: "Incidents & repair", group: "operations", ready: true },
  { href: "/admin/development", labelAr: "التطوير", labelEn: "Development", group: "operations", ready: true },
  { href: "/admin/deployments", labelAr: "النشر", labelEn: "Deployments", group: "operations", ready: true },
  { href: "/admin/agents", labelAr: "الوكلاء", labelEn: "Agents", group: "platform", ready: true },
  { href: "/admin/users", labelAr: "المستخدمون", labelEn: "Users", group: "platform", ready: true },
  { href: "/admin/workspaces", labelAr: "مساحات العمل", labelEn: "Workspaces", group: "platform", ready: true },
  { href: "/admin/integrations", labelAr: "التكاملات", labelEn: "Integrations", group: "platform", ready: true },
  { href: "/admin/studios", labelAr: "الاستوديوهات", labelEn: "Studios", group: "platform", ready: true },
  { href: "/admin/browser", labelAr: "المتصفح", labelEn: "Browser", group: "platform", ready: true },
  { href: "/admin/automation", labelAr: "الأتمتة", labelEn: "Automation", group: "operations", ready: true },
  { href: "/admin/security", labelAr: "الأمان", labelEn: "Security", group: "governance", ready: true },
  { href: "/admin/billing", labelAr: "الفوترة", labelEn: "Billing", group: "governance", ready: true },
  { href: "/admin/reports", labelAr: "التقارير اليومية", labelEn: "Daily reports", group: "governance", ready: false },
];

export const GROUP_LABELS: Record<AdminNavItem["group"], { ar: string; en: string }> = {
  command: { ar: "القيادة", en: "Command" },
  platform: { ar: "المنصة", en: "Platform" },
  operations: { ar: "التشغيل", en: "Operations" },
  governance: { ar: "الحوكمة", en: "Governance" },
};

export function findSection(href: string): AdminNavItem | null {
  return ADMIN_NAV.find((item) => item.href === href) ?? null;
}
