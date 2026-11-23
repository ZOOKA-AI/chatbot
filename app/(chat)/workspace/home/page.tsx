import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  Bot,
  CalendarClock,
  Cable,
  FolderKanban,
  Globe,
  MessageSquareText,
  Palette,
  Plug,
  Sparkles,
  Wallet,
} from "lucide-react";
import { listAgents } from "@/lib/agents/command-center";
import { withCommanderScope } from "@/lib/agents/commander-scope";
import { listSchedules } from "@/lib/agents/schedule";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  integrationLabel,
  relativeTime,
  section,
  summarizeAgents,
  summarizeIntegrations,
  summarizeSchedules,
  type Section,
} from "@/lib/dashboard/sections";
import { listProjects } from "@/lib/projects/store";
import { getChatsByOrganizationId } from "@/lib/db/queries";
import { withTenantPage } from "@/lib/db/request-tenant";
import {
  ensureWalletForCurrentPeriod,
  readWallet,
} from "@/lib/db/token-wallets";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { getLiveIntegrationStatus } from "@/lib/integrations/live-status";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";
import { workspacePlans } from "@/lib/saas/plans";
import { displayWorkspaceName } from "@/lib/workspace-name";

export const metadata: Metadata = { title: "الرئيسية" };

type Lang = "ar" | "en";

const PLAN_NAMES_AR: Record<string, string> = {
  free: "المجانية",
  pro: "الاحترافية",
  business: "الأعمال",
};

function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }
  const lang = (await getLang()) as Lang;
  const ar = lang === "ar";
  const t = (arabic: string, english: string) => (ar ? arabic : english);
  const org = context.organizationId;

  const [agents, projects, chats, schedules, integrations, plan, wallet] = await Promise.all([
    section(async () => summarizeAgents(await withCommanderScope(org, () => listAgents(org)))),
    // Same AgentProject source as /workspace/projects, which the card links to.
    section(async () => await withCommanderScope(org, () => listProjects(org))),
    section(
      async () =>
        (
          await getChatsByOrganizationId({
            organizationId: org,
            userId: context.user.id,
            limit: 5,
            startingAfter: null,
            endingBefore: null,
          })
        ).chats
    ),
    section(async () => summarizeSchedules(await listSchedules(org, 50))),
    section(async () => summarizeIntegrations(await getLiveIntegrationStatus(org))),
    section(() => getWorkspaceEntitlements(org)),
    section(() => readWallet(org)),
  ]);

  // A paid or launch-program workspace is entitled to tokens for the current
  // period even before the first Stripe invoice exists. Provision idempotently
  // so the dashboard shows the real allowance instead of "no wallet".
  const fundedWallet = plan.ok
    ? await section(() => ensureWalletForCurrentPeriod(org, plan.data.plan))
    : wallet;

  const email = context.user.email ?? "";
  const firstName = email.includes("@") ? email.split("@")[0] : "";

  return (
    <main
      className="relative mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-3 pb-6 md:gap-6 md:px-6 md:pt-6"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-600/20 via-background to-indigo-600/10 p-5 md:p-8">
        <div
          aria-hidden="true"
          className="-top-24 pointer-events-none absolute end-[-6rem] size-72 rounded-full bg-violet-500/20 blur-3xl"
        />
        <p className="text-muted-foreground text-sm">
          {displayWorkspaceName(context.workspace.name, lang)}
        </p>
        <h1 className="mt-1 font-bold text-2xl tracking-tight md:text-3xl">
          {t("مرحباً بك في ZOOKA-AI", "Welcome to ZOOKA-AI")}
          {firstName ? (
            <span className="block font-medium text-base text-muted-foreground md:inline md:ps-2">
              {firstName}
            </span>
          ) : null}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {t("ما الذي تريد إنجازه اليوم؟", "What do you want to get done today?")}
        </p>
        <form action="/" className="mt-4 flex gap-2" method="get">
          <label className="sr-only" htmlFor="home-prompt">
            {t("اكتب طلبك", "Type your request")}
          </label>
          <input
            className="h-12 min-w-0 flex-1 rounded-2xl border border-violet-500/30 bg-background/80 px-4 text-base shadow-sm outline-none backdrop-blur placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-violet-500"
            id="home-prompt"
            name="prompt"
            placeholder={t("مثال: لخّص بريدي اليوم واقترح الردود", "e.g. Summarise today's email and draft replies")}
            required
          />
          <button
            className="h-12 shrink-0 rounded-2xl bg-gradient-to-l from-violet-600 to-indigo-600 px-5 font-semibold text-sm text-white shadow-lg shadow-violet-900/30 transition hover:opacity-90"
            type="submit"
          >
            {t("ابدأ", "Start")}
          </button>
        </form>
      </section>

      {/* Quick actions */}
      <nav aria-label={t("إجراءات سريعة", "Quick actions")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { href: "/", icon: MessageSquareText, ar: "محادثة ذكية", en: "Smart chat" },
            { href: "/workspace/agents", icon: Bot, ar: "إنشاء وكيل", en: "Create agent" },
            { href: "/workspace/live-browser", icon: Globe, ar: "متصفح الذكاء", en: "AI browser" },
            { href: "/studio", icon: Palette, ar: "الاستوديو", en: "AI Studio" },
            { href: "/workspace/projects", icon: FolderKanban, ar: "إنشاء مشروع", en: "New project" },
            { href: "/workspace/schedules", icon: CalendarClock, ar: "الأتمتة", en: "Automations" },
          ].map((action) => (
            <li key={action.href}>
              <Link
                className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/60 p-3 text-center font-medium text-sm transition hover:border-violet-500/50 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                href={action.href}
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-500/20 text-violet-300 transition group-hover:scale-105">
                  <action.icon aria-hidden="true" className="size-5" />
                </span>
                {ar ? action.ar : action.en}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Stats */}
      <section aria-label={t("نظرة سريعة", "At a glance")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("الوكلاء النشطون", "Active agents")}
          value={agents.ok ? `${agents.data.active}/${agents.data.total}` : null}
          lang={lang}
        />
        <Stat label={t("المشاريع", "Projects")} value={projects.ok ? String(projects.data.length) : null} lang={lang} />
        <Stat
          label={t("أتمتة مفعّلة", "Automations on")}
          value={schedules.ok ? String(schedules.data.enabled) : null}
          lang={lang}
        />
        <Stat
          label={t("تكاملات متصلة", "Integrations")}
          value={integrations.ok ? String(integrations.data.connected.length) : null}
          lang={lang}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Agents */}
        <Card
          action={{ href: "/workspace/agents", label: t("إدارة", "Manage") }}
          icon={Bot}
          title={t("وكلائي", "My agents")}
        >
          <SectionBody
            empty={t("لا يوجد وكلاء بعد. أنشئ أول وكيل وحدد أدواته.", "No agents yet. Create one and choose its tools.")}
            lang={lang}
            section={agents.ok ? { ok: true, data: agents.data.top } : agents}
          >
            {(rows) => (
              <ul className="flex flex-col divide-y">
                {rows.map((agent) => (
                  <li className="flex items-center justify-between gap-3 py-2.5" key={agent.id}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{agent.name}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {agent.role} · {relativeTime(agent.lastSeenAt, lang)}
                      </p>
                    </div>
                    <StatusPill lang={lang} status={agent.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionBody>
        </Card>

        {/* Recent chats */}
        <Card action={{ href: "/", label: t("محادثة جديدة", "New chat") }} icon={MessageSquareText} title={t("آخر المحادثات", "Recent chats")}>
          <SectionBody
            empty={t("لم تبدأ أي محادثة بعد.", "No conversations yet.")}
            lang={lang}
            section={chats}
          >
            {(rows) => (
              <ul className="flex flex-col divide-y">
                {rows.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-violet-300"
                      href={`/chat/${chat.id}`}
                    >
                      <span className="truncate">{chat.title}</span>
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {relativeTime(chat.createdAt, lang)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionBody>
        </Card>

        {/* Projects */}
        <Card action={{ href: "/workspace/projects", label: t("الكل", "All") }} icon={FolderKanban} title={t("المشاريع الأخيرة", "Recent projects")}>
          <SectionBody
            empty={t("لا توجد مشاريع بعد.", "No projects yet.")}
            lang={lang}
            section={
              projects.ok
                ? { ok: true, data: projects.data.slice(0, 4) }
                : projects
            }
          >
            {(rows) => (
              <ul className="flex flex-col divide-y">
                {rows.map((project) => (
                  <li className="flex items-center justify-between gap-3 py-2.5" key={project.id}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{project.name}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {project.summary ?? ""}
                      </p>
                    </div>
                    <StatusPill lang={lang} status={project.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionBody>
        </Card>

        {/* Automations */}
        <Card action={{ href: "/workspace/schedules", label: t("إدارة", "Manage") }} icon={CalendarClock} title={t("الأتمتة القادمة", "Upcoming automations")}>
          <SectionBody
            empty={t("لا توجد مهام مجدولة مفعّلة.", "No enabled scheduled tasks.")}
            lang={lang}
            section={schedules.ok ? { ok: true, data: schedules.data.upcoming } : schedules}
          >
            {(rows) => (
              <ul className="flex flex-col divide-y">
                {rows.map((row) => (
                  <li className="flex items-center justify-between gap-3 py-2.5 text-sm" key={row.id}>
                    <span className="truncate">{row.title}</span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {relativeTime(row.nextRunAt, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionBody>
        </Card>

        {/* Integrations */}
        <Card action={{ href: "/settings/integrations", label: t("إدارة التكاملات", "Manage") }} icon={Plug} title={t("التكاملات المتصلة", "Connected integrations")}>
          {integrations.ok ? (
            integrations.data.connected.length === 0 && integrations.data.needsReconnect.length === 0 ? (
              <Empty text={t("لم تربط أي خدمة بعد.", "No services connected yet.")} />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {integrations.data.connected.map((id) => (
                  <li
                    className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300 text-xs"
                    key={id}
                  >
                    <Cable aria-hidden="true" className="size-3.5" />
                    {integrationLabel(id, lang)} · {t("متصل", "connected")}
                  </li>
                ))}
                {integrations.data.needsReconnect.map((id) => (
                  <li
                    className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-300 text-xs"
                    key={id}
                  >
                    {integrationLabel(id, lang)} · {t("يحتاج إعادة ربط", "reconnect")}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Unavailable lang={lang} />
          )}
        </Card>

        {/* Plan and wallet */}
        <Card action={{ href: "/workspace/billing", label: t("الفوترة", "Billing") }} icon={Wallet} title={t("الباقة والرصيد", "Plan and balance")}>
          {plan.ok ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">{t("الباقة", "Plan")}</dt>
                <dd className="font-semibold">
                  {ar
                    ? (PLAN_NAMES_AR[plan.data.plan] ?? plan.data.plan)
                    : (workspacePlans[plan.data.plan]?.name ?? plan.data.plan)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t("تشغيلات الوكيل المتبقية", "Agent runs left")}</dt>
                <dd className="font-semibold">{plan.data.agentRunsRemaining}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">{t("محفظة التوكنز", "Token wallet")}</dt>
                <dd className="font-semibold">
                  {fundedWallet.ok
                    ? fundedWallet.data
                      ? Number(fundedWallet.data.weighted_remaining).toLocaleString(ar ? "ar" : "en")
                      : t("لا توجد محفظة لهذه المساحة", "No wallet for this workspace")
                    : t("غير متاح الآن", "Unavailable right now")}
                </dd>
              </div>
            </dl>
          ) : (
            <Unavailable lang={lang} />
          )}
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Sparkles aria-hidden="true" className="size-3.5" />
        {t(
          "كل الأرقام هنا من بيانات مساحتك الحقيقية. القسم الذي يتعذّر تحميله يظهر كـ«غير متاح» بدل رقم تقديري.",
          "Every number here comes from your workspace. A section that fails to load says so instead of showing an estimate."
        )}
      </p>
    </main>
  );
}

function Stat({ label, value, lang }: { label: string; value: string | null; lang: Lang }) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-bold text-2xl tabular-nums">
        {value ?? <span className="font-normal text-muted-foreground text-sm">{lang === "ar" ? "غير متاح" : "Unavailable"}</span>}
      </p>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof Bot;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card/60 p-4 md:p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-base">
          <Icon aria-hidden="true" className="size-4 text-violet-400" />
          {title}
        </h2>
        {action ? (
          <Link className="inline-flex min-h-11 items-center px-1 text-violet-300 text-xs hover:underline" href={action.href}>
            {action.label}
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function SectionBody<T>({
  section: data,
  empty,
  lang,
  children,
}: {
  section: Section<T[]>;
  empty: string;
  lang: Lang;
  children: (rows: T[]) => React.ReactNode;
}) {
  if (!data.ok) return <Unavailable lang={lang} />;
  if (data.data.length === 0) return <Empty text={empty} />;
  return <>{children(data.data)}</>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground text-sm">{text}</p>;
}

function Unavailable({ lang }: { lang: Lang }) {
  return (
    <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center text-amber-200/90 text-sm" role="status">
      {lang === "ar" ? "تعذّر تحميل هذا القسم الآن. حدّث الصفحة بعد قليل." : "This section could not load. Refresh in a moment."}
    </p>
  );
}

function StatusPill({ status, lang }: { status: string; lang: Lang }) {
  const map: Record<string, { ar: string; en: string; cls: string }> = {
    active: { ar: "يعمل", en: "Active", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
    paused: { ar: "متوقف", en: "Paused", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
    disabled: { ar: "معطّل", en: "Disabled", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
    revoked: { ar: "ملغى", en: "Revoked", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  };
  const entry = map[status] ?? { ar: status, en: status, cls: "border-border bg-muted text-muted-foreground" };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${entry.cls}`}>
      {lang === "ar" ? entry.ar : entry.en}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      <div className="h-44 animate-pulse rounded-3xl bg-muted/50" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/40" key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div className="h-48 animate-pulse rounded-2xl bg-muted/40" key={i} />
        ))}
      </div>
    </div>
  );
}

export default withTenantPage(Page);
