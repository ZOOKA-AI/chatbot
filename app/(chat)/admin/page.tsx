import { redirect } from "next/navigation";
import { requireWorkspaceRole, getWorkspaceContext } from "@/lib/auth/workspace";
import {
  getAdminOverview,
  getAdminRecentActivity,
  getAdminUsers,
} from "@/lib/db/queries";
import { getLang, type Lang } from "@/lib/i18n";
import { displayWorkspaceName } from "@/lib/workspace-name";

const PAGE_SIZE = 25;

const t = {
  en: {
    title: "Admin dashboard",
    forbidden: "You need an admin role to view this page.",
    error: "Something went wrong while loading the dashboard. Please try again.",
    users: "Users",
    chats: "Chats",
    messages: "Messages",
    plan: "Plan",
    status: "Status",
    monthly: "Messages this month",
    noSubscription: "No subscription (free)",
    members: "Members",
    email: "Email",
    role: "Role",
    joined: "Joined",
    noUsers: "No users yet.",
    activity: "Recent activity",
    noActivity: "No recent activity.",
    event: "Event",
    qty: "Qty",
    time: "Time",
    previous: "Previous",
    next: "Next",
  },
  ar: {
    title: "لوحة تحكم الأدمن",
    forbidden: "تحتاج إلى صلاحية أدمن لعرض هذه الصفحة.",
    error: "حدث خطأ أثناء تحميل اللوحة. حاول مرة أخرى.",
    users: "المستخدمون",
    chats: "المحادثات",
    messages: "الرسائل",
    plan: "الخطة",
    status: "الحالة",
    monthly: "رسائل هذا الشهر",
    noSubscription: "لا يوجد اشتراك (مجاني)",
    members: "الأعضاء",
    email: "البريد الإلكتروني",
    role: "الدور",
    joined: "تاريخ الانضمام",
    noUsers: "لا يوجد مستخدمون بعد.",
    activity: "آخر النشاطات",
    noActivity: "لا توجد نشاطات حديثة.",
    event: "الحدث",
    qty: "الكمية",
    time: "الوقت",
    previous: "السابق",
    next: "التالي",
  },
} satisfies Record<Lang, Record<string, string>>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }
  const lang = await getLang();
  const copy = t[lang];

  if (!(await requireWorkspaceRole("admin"))) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p className="rounded-md border p-3 text-sm" role="alert">
          {copy.forbidden}
        </p>
      </main>
    );
  }

  const { page } = await searchParams;
  const pageIndex = Math.max(Math.floor(Number(page) || 0), 0);
  const organizationId = context.organizationId;

  let data: Awaited<ReturnType<typeof loadData>>;
  try {
    data = await loadData(organizationId, pageIndex);
  } catch {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p className="rounded-md border border-destructive p-3 text-sm" role="alert">
          {copy.error}
        </p>
      </main>
    );
  }
  const { overview, list, activity } = data;

  const stats = [
    [copy.users, overview.users],
    [copy.chats, overview.chats],
    [copy.messages, overview.messages],
    [copy.monthly, overview.monthlyMessages],
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm">
          {displayWorkspaceName(context.workspace.name, lang)}
        </p>
        <h1 className="font-semibold text-2xl">{copy.title}</h1>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map(([label, value]) => (
          <div className="rounded-lg border p-4" key={label}>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="font-semibold text-2xl">{value.toLocaleString()}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border p-4 text-sm">
        {overview.subscription ? (
          <p>
            {copy.plan}: {overview.subscription.plan} · {copy.status}:{" "}
            {overview.subscription.status}
          </p>
        ) : (
          <p>{copy.noSubscription}</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium text-lg">{copy.members}</h2>
        {list.users.length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.noUsers}</p>
        ) : (
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-start">{copy.email}</th>
                <th className="text-start">{copy.role}</th>
                <th className="text-start">{copy.joined}</th>
              </tr>
            </thead>
            <tbody>
              {list.users.map((member) => (
                <tr key={member.userId}>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{member.joinedAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex gap-4 text-sm">
          {pageIndex > 0 && (
            <a href={`/admin?page=${pageIndex - 1}`}>{copy.previous}</a>
          )}
          {list.hasMore && (
            <a href={`/admin?page=${pageIndex + 1}`}>{copy.next}</a>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium text-lg">{copy.activity}</h2>
        {activity.length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.noActivity}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-start">{copy.event}</th>
                <th className="text-start">{copy.qty}</th>
                <th className="text-start">{copy.time}</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((item) => (
                <tr key={item.id}>
                  <td>{item.event}</td>
                  <td>{item.quantity}</td>
                  <td>{item.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

async function loadData(organizationId: string, pageIndex: number) {
  const [overview, list, activity] = await Promise.all([
    getAdminOverview(organizationId),
    getAdminUsers({
      organizationId,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    }),
    getAdminRecentActivity({ organizationId, limit: 20 }),
  ]);
  return { overview, list, activity };
}
