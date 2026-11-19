import type { ReactNode } from "react";

import type { AdminTable, Metric, MetricState } from "@/lib/admin/types";

const STATE_STYLE: Record<MetricState, { ar: string; en: string; className: string }> = {
  ok: { ar: "مقروء", en: "OK", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  empty: { ar: "لا بيانات", en: "Empty", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  not_configured: {
    ar: "غير مهيّأ",
    en: "Not configured",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  error: { ar: "فشل القراءة", en: "Read failed", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

export function StatePill({ state, lang }: { state: MetricState; lang: "ar" | "en" }) {
  const style = STATE_STYLE[state];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${style.className}`}>
      {lang === "ar" ? style.ar : style.en}
    </span>
  );
}

/**
 * One metric, with the state it was measured in.
 *
 * A null value renders as a dash plus the state, never as zero: "we could not read this" and "the
 * count is zero" are different facts and the screen keeps them different.
 */
export function MetricCard({ metric, lang }: { metric: Metric; lang: "ar" | "en" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-white/60">{lang === "ar" ? metric.labelAr : metric.labelEn}</p>
        <StatePill state={metric.state} lang={lang} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
        {metric.value === null ? "—" : metric.value.toLocaleString(lang === "ar" ? "ar-AE" : "en-US")}
      </p>
      <p dir="ltr" className="mt-1 truncate font-mono text-[10px] text-white/30">
        {metric.source}
      </p>
      {metric.detail ? (
        <p dir="ltr" className="mt-1 line-clamp-2 font-mono text-[10px] text-rose-300/70">
          {metric.detail}
        </p>
      ) : null}
    </div>
  );
}

export function MetricGrid({ metrics, lang }: { metrics: Metric[]; lang: "ar" | "en" }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.key} metric={metric} lang={lang} />
      ))}
    </div>
  );
}

export function DataTable({ table, lang }: { table: AdminTable; lang: "ar" | "en" }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03]">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <h2 className="text-sm font-medium text-white">{lang === "ar" ? table.titleAr : table.titleEn}</h2>
        <StatePill state={table.state} lang={lang} />
      </header>
      {table.rows.length === 0 ? (
        <p className="px-3 py-4 text-xs text-white/50">
          {table.state === "not_configured"
            ? lang === "ar"
              ? "المصدر غير مهيّأ في هذه البيئة، فلم يُقرأ شيء."
              : "The source is not configured in this environment, so nothing was read."
            : lang === "ar"
              ? "لا صفوف."
              : "No rows."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-white/50">
              <tr>
                {table.columns.map((column) => (
                  <th key={column.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {lang === "ar" ? column.labelAr : column.labelEn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-3 py-2">
                      {row[column.key] === null || row[column.key] === undefined
                        ? "—"
                        : String(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SectionView({
  title,
  description,
  lang,
  children,
}: {
  title: string;
  description: string;
  lang: "ar" | "en";
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-xs text-white/60">{description}</p>
      </header>
      {children}
      <p className="text-[11px] text-white/30">
        {lang === "ar"
          ? "كل رقم هنا مقروء من قاعدة التطبيق الآن، وكل حالة تُسمّى كما هي."
          : "Every number here was read from the app database just now, and every state is named as it is."}
      </p>
    </div>
  );
}
