import type { JourneyReport, JourneyStep } from "@/lib/growth/journey-report";

const LABELS: Record<JourneyStep["key"], { ar: string; en: string }> = {
  demo: { ar: "جرّب الديمو", en: "Tried the demo" },
  signup: { ar: "سجّل حسابًا", en: "Signed up" },
  connection: { ar: "أول ربط أداة", en: "First connection" },
  success: { ar: "أول تنفيذ ناجح", en: "First successful action" },
};

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 1000) / 10}%`;
}

/** Demo -> signup -> first connection -> first successful agent action. */
export function JourneySection({
  ar,
  journey,
}: {
  ar: boolean;
  journey: JourneyReport | null;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="journey">
      <h2 className="text-sm font-semibold">
        {ar ? "رحلة المستخدم (٣٠ يومًا)" : "User journey (30 days)"}
      </h2>
      {journey === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {ar ? "تعذّرت قراءة الرحلة الآن." : "The journey could not be read right now."}
        </p>
      ) : (
        <>
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-start font-normal">{ar ? "الخطوة" : "Step"}</th>
                <th className="py-1 text-end font-normal">{ar ? "العدد" : "Count"}</th>
                <th className="py-1 text-end font-normal">
                  {ar ? "من الخطوة السابقة" : "From previous"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {journey.steps.map((step) => (
                <tr
                  className={step.key === journey.biggestDrop ? "text-amber-500" : undefined}
                  key={step.key}
                >
                  <td className="py-1.5">{LABELS[step.key][ar ? "ar" : "en"]}</td>
                  <td className="py-1.5 text-end font-mono">
                    {step.count === null ? (ar ? "غير متاح" : "n/a") : step.count}
                  </td>
                  <td className="py-1.5 text-end font-mono">{percent(step.fromPrevious)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journey.demoMessages !== null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {ar
                ? `${journey.demoMessages} رسالة ديمو في الفترة.`
                : `${journey.demoMessages} demo messages in this window.`}
            </p>
          ) : null}
          {journey.biggestDrop ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {ar
                ? `أكبر تسرّب عند: ${LABELS[journey.biggestDrop].ar}.`
                : `Biggest drop at: ${LABELS[journey.biggestDrop].en}.`}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {ar
              ? "الديمو مجهول الهوية: نسبة الديمو إلى التسجيل مقارنة عددين لا تتبُّع شخص. باقي الخطوات لنفس الحسابات المسجّلة في الفترة."
              : "The demo is anonymous: demo-to-signup compares two counts. The other steps follow the same accounts."}
          </p>
        </>
      )}
    </section>
  );
}
