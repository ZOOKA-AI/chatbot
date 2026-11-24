import type { Lang } from "@/lib/i18n";

export function OverviewSkeleton({ lang }: { lang?: Lang }) {
  const label =
    lang === "ar" ? "جارٍ التحميل…" : lang === "en" ? "Loading…" : "جارٍ التحميل… / Loading…";

  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-3 motion-safe:animate-pulse">
        <div className="h-20 rounded-xl bg-white/10" />
        <div className="h-20 rounded-xl bg-white/10" />
        <div className="h-20 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}
