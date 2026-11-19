import Link from "next/link";
import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import type { N8nAdminOverview, N8nStage } from "@/lib/integrations/n8n/admin-overview";
import { buildN8nAdminOverview } from "@/lib/integrations/n8n/admin-overview";
import { getLang } from "@/lib/i18n";

/**
 * Owner/admin view of the workspace's own n8n instance. Read-only by construction: the page renders a
 * snapshot and every control here is a link out to n8n's own UI, where the owner already has authority.
 */

const STAGE_COPY: Record<N8nStage, { en: string; ar: string; tone: string }> = {
  not_configured: {
    en: "Not configured",
    ar: "غير مهيأ",
    tone: "border-muted-foreground/30 text-muted-foreground",
  },
  configured: {
    en: "Configured, connection unproven",
    ar: "مهيأ فقط، الاتصال غير مُثبت",
    tone: "border-amber-500/50 text-amber-700 dark:text-amber-400",
  },
  connected: {
    en: "Connected (authenticated probe passed)",
    ar: "متصل (نجح فحص موثّق)",
    tone: "border-sky-500/50 text-sky-700 dark:text-sky-400",
  },
  operational: {
    en: "Operational (recent successful run)",
    ar: "تشغيلي (تشغيل ناجح حديث)",
    tone: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  },
  agent_ready: {
    en: "Agent-ready",
    ar: "جاهز للوكيل",
    tone: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  },
};

const REASON_COPY: Record<string, { en: string; ar: string }> = {
  no_credentials_stored: {
    en: "No n8n URL or API key is stored for this workspace.",
    ar: "لا يوجد عنوان n8n أو مفتاح واجهة محفوظ لهذه المساحة.",
  },
  authenticated_probe_failed: {
    en: "A key is stored, but the authenticated call to your instance did not succeed, so this is not connected.",
    ar: "المفتاح محفوظ، لكن الاستدعاء الموثّق إلى خادمك لم ينجح، لذلك لا تُعدّ متصلة.",
  },
  no_active_workflows: {
    en: "The instance answered, but no workflow is active.",
    ar: "الخادم استجاب، لكن لا يوجد سير عمل نشط.",
  },
  no_recent_successful_execution: {
    en: "No successful execution in the last 7 days, so operational status cannot be claimed.",
    ar: "لا يوجد تشغيل ناجح في آخر 7 أيام، فلا يمكن اعتبارها تشغيلية.",
  },
  agent_webhook_key_not_configured: {
    en: "The agent webhook key is not configured, so the agent cannot use this instance yet.",
    ar: "مفتاح ويبهوك الوكيل غير مهيأ، فلا يستطيع الوكيل استخدام هذا الخادم بعد.",
  },
};

function StageBadge({ stage, ar }: { stage: N8nStage; ar: boolean }) {
  const copy = STAGE_COPY[stage];
  return (
    <span className={`rounded-full border px-3 py-1 text-xs ${copy.tone}`}>
      {ar ? copy.ar : copy.en}
    </span>
  );
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().replace("T", " ").slice(0, 16);
}

export default async function N8nAdminPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (context.role !== "owner" && context.role !== "admin") redirect("/workspace");

  const lang = await getLang();
  const ar = lang === "ar";
  const overview: N8nAdminOverview = await buildN8nAdminOverview(context.organizationId);
  const reasons = overview.reasons.map(
    (reason) => REASON_COPY[reason] ?? { en: reason, ar: reason }
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6" dir={ar ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">
          {ar ? "أتمتة n8n — عرض إداري للقراءة فقط" : "n8n automation — admin read-only view"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar
            ? "هذه الصفحة تعرض حالة خادم n8n الخاص بمساحتك وما جرى فيه. لا يمكن تشغيل أي سير عمل أو تعديله أو حذفه من هنا، وكل رابط يفتح n8n نفسه حيث تملك الصلاحية."
            : "This page shows the state of your workspace's own n8n instance and what ran there. No workflow can be started, edited or deleted here; every link opens n8n itself, where you hold the authority."}
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <StageBadge stage={overview.stage} ar={ar} />
        <span className="text-muted-foreground text-xs">
          {ar ? "وقت الفحص" : "Probed"}: {formatWhen(overview.probedAt)}
        </span>
        {overview.baseUrl ? (
          <a
            className="text-xs underline underline-offset-2"
            href={overview.baseUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            {overview.baseUrl}
          </a>
        ) : null}
        {overview.probeError ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {ar ? "سبب فشل الفحص" : "Probe error"}: {overview.probeError}
          </span>
        ) : null}
        <Link className="ms-auto text-xs underline underline-offset-2" href="/settings/integrations#n8n">
          {ar ? "إعداد بيانات الاعتماد" : "Manage credentials"}
        </Link>
      </section>

      {reasons.length ? (
        <ul className="text-muted-foreground list-inside list-disc text-sm">
          {reasons.map((reason) => (
            <li key={reason.en}>{ar ? reason.ar : reason.en}</li>
          ))}
        </ul>
      ) : null}

      {overview.stage === "not_configured" ? null : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: ar ? "سير العمل" : "Workflows", value: overview.workflowCount },
              { label: ar ? "النشط" : "Active", value: overview.activeWorkflowCount },
              { label: ar ? "آخر تشغيل ناجح" : "Last success", value: formatWhen(overview.lastSuccessAt) },
              { label: ar ? "أخطاء حديثة" : "Recent errors", value: overview.errors.length },
            ].map((metric) => (
              <div className="rounded-lg border p-3" key={metric.label}>
                <div className="text-muted-foreground text-xs">{metric.label}</div>
                <div className="mt-1 text-lg font-medium">{metric.value}</div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{ar ? "سير العمل المتاح" : "Available workflows"}</h2>
            {overview.workflows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {ar ? "لا توجد سير عمل ظاهرة لهذا المفتاح." : "No workflows are visible to this key."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs">
                    <tr className="border-b">
                      <th className="p-2 text-start">{ar ? "الاسم" : "Name"}</th>
                      <th className="p-2 text-start">{ar ? "الحالة" : "Status"}</th>
                      <th className="p-2 text-start">{ar ? "آخر تحديث" : "Updated"}</th>
                      <th className="p-2 text-start">{ar ? "فتح" : "Open"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.workflows.map((workflow) => (
                      <tr className="border-b last:border-0" key={workflow.id}>
                        <td className="p-2">{workflow.name}</td>
                        <td className="p-2">
                          {workflow.active ? (ar ? "نشط" : "Active") : ar ? "موقوف" : "Inactive"}
                        </td>
                        <td className="p-2">{formatWhen(workflow.updatedAt)}</td>
                        <td className="p-2">
                          <a
                            className="underline underline-offset-2"
                            href={workflow.deepLink}
                            rel="noreferrer noopener"
                            target="_blank"
                          >
                            {ar ? "في n8n" : "in n8n"}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{ar ? "أحدث التنفيذات" : "Recent executions"}</h2>
            {overview.executions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {ar
                  ? "لا توجد تنفيذات ظاهرة. الخادم قد يحتفظ بها لمدة قصيرة فقط."
                  : "No executions are visible. Some instances keep them for a few hours only."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs">
                    <tr className="border-b">
                      <th className="p-2 text-start">#</th>
                      <th className="p-2 text-start">{ar ? "سير العمل" : "Workflow"}</th>
                      <th className="p-2 text-start">{ar ? "الحالة" : "Status"}</th>
                      <th className="p-2 text-start">{ar ? "البداية" : "Started"}</th>
                      <th className="p-2 text-start">{ar ? "النهاية" : "Stopped"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.executions.slice(0, 20).map((execution) => (
                      <tr className="border-b last:border-0" key={execution.id}>
                        <td className="p-2 font-mono text-xs">{execution.id}</td>
                        <td className="p-2">{execution.workflowName ?? execution.workflowId ?? "—"}</td>
                        <td className="p-2">
                          {execution.status === "error" || execution.status === "crashed" || execution.status === "failed" ? (
                            <span className="text-red-600 dark:text-red-400">{execution.status}</span>
                          ) : (
                            execution.status
                          )}
                        </td>
                        <td className="p-2">{formatWhen(execution.startedAt)}</td>
                        <td className="p-2">{formatWhen(execution.stoppedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
