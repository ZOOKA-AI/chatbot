/**
 * Pure shaping for the home dashboard, kept free of server-only imports so it
 * can be unit tested. Every section is either real data or an explicit
 * "unavailable" marker: the dashboard never fills a gap with sample numbers.
 */

export type Section<T> = { ok: true; data: T } | { ok: false };

export async function section<T>(work: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    console.error("dashboard section unavailable", (error as Error)?.message);
    return { ok: false };
  }
}

export type AgentSummary = {
  id: string;
  name: string;
  role: string;
  status: string;
  lastSeenAt: Date | null;
};

export function summarizeAgents(
  rows: Array<{
    id: string;
    displayName: string;
    role: string;
    status: string;
    lastSeenAt: Date | null;
  }>,
  limit = 5
): { total: number; active: number; top: AgentSummary[] } {
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    top: rows.slice(0, limit).map((row) => ({
      id: row.id,
      name: row.displayName,
      role: row.role,
      status: row.status,
      lastSeenAt: row.lastSeenAt,
    })),
  };
}

export function summarizeSchedules(
  rows: Array<{ id: string; title: string; enabled: boolean; nextRunAt: Date | null }>,
  limit = 3
) {
  const enabled = rows.filter((row) => row.enabled);
  const upcoming = enabled
    .filter((row) => row.nextRunAt)
    .sort((a, b) => (a.nextRunAt?.getTime() ?? 0) - (b.nextRunAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((row) => ({ id: row.id, title: row.title, nextRunAt: row.nextRunAt }));
  return { total: rows.length, enabled: enabled.length, upcoming };
}

const INTEGRATION_LABELS: Record<string, { ar: string; en: string }> = {
  gmail: { ar: "Gmail", en: "Gmail" },
  google_drive: { ar: "Google Drive", en: "Google Drive" },
  google_calendar: { ar: "تقويم Google", en: "Google Calendar" },
  github: { ar: "GitHub", en: "GitHub" },
  slack: { ar: "سلاك", en: "Slack" },
  n8n: { ar: "n8n", en: "n8n" },
  vercel: { ar: "Vercel", en: "Vercel" },
  supabase: { ar: "Supabase", en: "Supabase" },
};

export function integrationLabel(providerId: string, lang: "ar" | "en"): string {
  return INTEGRATION_LABELS[providerId]?.[lang] ?? providerId;
}

export function summarizeIntegrations(status: {
  connected: Set<string>;
  needsReconnect: Set<string>;
}) {
  return {
    connected: [...status.connected].sort(),
    needsReconnect: [...status.needsReconnect].filter((id) => !status.connected.has(id)).sort(),
  };
}

/** "منذ 5 دقائق" / "5 min ago", without a dependency. */
export function relativeTime(date: Date | null | undefined, lang: "ar" | "en", now = Date.now()) {
  if (!date) {
    return lang === "ar" ? "لم يُسجَّل" : "never";
  }
  const minutes = Math.round((now - new Date(date).getTime()) / 60_000);
  const future = minutes < 0;
  const abs = Math.abs(minutes);
  const [value, unitAr, unitEn] =
    abs < 1
      ? [0, "", ""]
      : abs < 60
        ? [abs, "دقيقة", "min"]
        : abs < 60 * 24
          ? [Math.round(abs / 60), "ساعة", "h"]
          : [Math.round(abs / (60 * 24)), "يوم", "d"];
  if (value === 0) {
    return lang === "ar" ? "الآن" : "just now";
  }
  if (lang === "ar") {
    return future ? `بعد ${value} ${unitAr}` : `منذ ${value} ${unitAr}`;
  }
  return future ? `in ${value}${unitEn}` : `${value}${unitEn} ago`;
}
