import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  auditReportUrl,
  openActions,
  POSTURE_MEASURED_AT,
  postureRows,
  sayyadRelease,
  stateLabel,
} from "@/lib/security/posture";

const stateClass: Record<string, string> = {
  needs_action: "border-red-500/40 bg-red-500/10 text-red-200",
  measured: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  unmeasured: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

export default async function WorkspaceSecurityPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const canManage = ["owner", "admin"].includes(String(context.role));
  if (!canManage) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-lg font-semibold">الأمان · Security</h1>
        <p className="text-sm opacity-70">هذا القسم متاح لمالك المساحة ومديريها فقط.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">الأمان · Security</h1>
        <p className="text-sm opacity-70">
          كل صف في هذه الصفحة ناتج فحص حقيقي بتاريخه. ما لم يُقس مكتوب أنه غير مقيس، لا مُقدَّرًا. الصفحة لا تفحص
          جهازك ولا تطلب صلاحيات: هي سجل حالة وخطوات تنفيذ.
        </p>
        <p className="text-xs opacity-60">آخر قياس: {POSTURE_MEASURED_AT}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">حالة الحسابات والأجهزة</h2>
        <ul className="flex flex-col gap-3">
          {postureRows.map((row) => (
            <li
              key={`${row.area}-${row.account}`}
              className="rounded-lg border border-border/60 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{row.area}</span>
                  <span className="text-xs opacity-60">{row.account}</span>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${stateClass[row.state]}`}
                >
                  {stateLabel(row.state)}
                </span>
              </div>
              <p className="mt-2 text-sm opacity-80">{row.detail}</p>
              <p className="mt-1 text-xs opacity-50">قياس: {row.measuredAt}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">خطوات مفتوحة ({openActions.length})</h2>
        <ol className="flex flex-col gap-3">
          {openActions.map((action, index) => (
            <li key={action.id} className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-semibold">
                {index + 1}. {action.title}
              </p>
              <p className="mt-1 text-sm opacity-80">{action.why}</p>
              <p className="mt-2 text-xs opacity-70">{action.where}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">
          تطبيق صياد · الإصدار {sayyadRelease.version}
        </h2>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-sm opacity-80">
            حارس محلي على أندرويد يمسك شبكة أي تطبيق تحجزه ويسجّل حركته. البصمة أدناه تخص الملف المسلَّم نفسه.
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="opacity-60">الحزمة</dt>
              <dd className="font-mono">{sayyadRelease.packageName}</dd>
            </div>
            <div>
              <dt className="opacity-60">الإصدار</dt>
              <dd className="font-mono">
                {sayyadRelease.version} ({sayyadRelease.versionCode})
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="opacity-60">SHA-256</dt>
              <dd className="break-all font-mono">{sayyadRelease.sha256}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              className="rounded-md border border-border px-3 py-2 text-sm hover:opacity-80"
              href={sayyadRelease.downloadUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              تنزيل صياد {sayyadRelease.version}
            </a>
            <a
              className="rounded-md border border-border px-3 py-2 text-sm hover:opacity-80"
              href={auditReportUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              تقرير الفحص الكامل
            </a>
          </div>
          <p className="mt-3 text-xs opacity-60">
            التثبيت على سامسونج يحتاج إيقاف «الحماية المتقدمة» مؤقتًا، ثم إعادة تفعيلها بعد التثبيت.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 p-3">
            <h3 className="text-sm font-semibold">ما يفعله</h3>
            <ul className="mt-2 list-disc space-y-1 pe-5 text-xs opacity-80">
              {sayyadRelease.capabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <h3 className="text-sm font-semibold">ما لا يستطيعه</h3>
            <ul className="mt-2 list-disc space-y-1 pe-5 text-xs opacity-80">
              {sayyadRelease.limits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
