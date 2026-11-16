"use client";

import { useCallback, useEffect, useState } from "react";

type Schedule = {
  id: string;
  title: string;
  instruction: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  missedRunPolicy: string;
  upcoming?: string[];
};

type HistoryRow = { id: string; status: string; scheduledFor: string | null; createdAt: string; title: string };

const TIMEZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Cairo",
  "America/New_York",
  "UTC",
];

const PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day at 09:00", cron: "0 9 * * *" },
  { label: "Weekdays at 08:00", cron: "0 8 * * mon-fri" },
  { label: "Every Monday at 09:00", cron: "0 9 * * mon" },
  { label: "First of the month at 10:00", cron: "0 10 1 * *" },
];

const format = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    : "not scheduled";

/**
 * Schedules, driven entirely by the API.
 *
 * Every value on this screen comes from a response: the list, the next runs, the history.
 * The preview calls the same engine the scheduler uses, so it cannot promise a cadence the
 * server would refuse. Nothing here renders a state the server did not report.
 */
export function ScheduleConsole({ canManage }: { canManage: boolean }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [preview, setPreview] = useState<{ ok: boolean; local?: string[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agents/schedules", { cache: "no-store" });
      if (!response.ok) throw new Error(`list failed (${response.status})`);
      const body = await response.json();
      setSchedules(body.schedules ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "could not load schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Preview is server-computed and debounced, so typing does not flood the endpoint.
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!cron.trim()) return;
      try {
        const response = await fetch(
          `/api/agents/schedules/preview?cron=${encodeURIComponent(cron)}&timezone=${encodeURIComponent(timezone)}&count=3`,
          { cache: "no-store" }
        );
        const body = await response.json();
        setPreview(body.ok ? { ok: true, local: body.local } : { ok: false, error: body.error });
      } catch {
        setPreview({ ok: false, error: "preview_unavailable" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [cron, timezone]);

  async function create() {
    setBusy(true);
    try {
      const response = await fetch("/api/agents/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, instruction, cronExpression: cron, timezone }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "could not create the schedule");
        return;
      }
      setTitle("");
      setInstruction("");
      setError(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(schedule: Schedule) {
    const response = await fetch(`/api/agents/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !schedule.enabled }),
    });
    if (!response.ok) setError("could not change the schedule");
    await load();
  }

  async function open(schedule: Schedule) {
    if (openId === schedule.id) {
      setOpenId(null);
      return;
    }
    setOpenId(schedule.id);
    if (history[schedule.id]) return;
    const response = await fetch(`/api/agents/schedules/${schedule.id}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setHistory((current) => ({ ...current, [schedule.id]: body.history ?? [] }));
  }

  async function remove(id: string) {
    const response = await fetch(`/api/agents/schedules/${id}`, { method: "DELETE" });
    if (!response.ok) setError("could not delete the schedule");
    setConfirming(null);
    setOpenId(null);
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">New schedule</h2>
          <div className="flex flex-col gap-2">
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Title, e.g. Weekly repository report"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              className="rounded border px-3 py-2 text-sm"
              placeholder="What should run each time"
              rows={3}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.cron}
                  type="button"
                  onClick={() => setCron(preset.cron)}
                  className={`rounded border px-2 py-1 text-xs ${cron === preset.cron ? "bg-black text-white" : ""}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-40 rounded border px-3 py-2 font-mono text-sm"
                value={cron}
                onChange={(event) => setCron(event.target.value)}
                aria-label="Cron expression"
              />
              <select
                className="rounded border px-3 py-2 text-sm"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                aria-label="Timezone"
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs">
              {preview === null
                ? "Checking…"
                : preview.ok
                  ? `Next runs: ${(preview.local ?? []).join(" · ")} (${timezone})`
                  : `This will not run: ${preview.error}`}
            </p>
            <button
              type="button"
              onClick={create}
              disabled={busy || !preview?.ok || title.length < 3 || instruction.length < 10}
              className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Create schedule
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Schedules ({schedules.length})</h2>
        {loading ? <p className="text-sm">Loading…</p> : null}
        {!loading && schedules.length === 0 ? <p className="text-sm">No schedules yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {schedule.title}{" "}
                    <span className="text-xs opacity-60">{schedule.enabled ? "active" : "paused"}</span>
                  </p>
                  <p className="font-mono text-xs">
                    {schedule.cronExpression} · {schedule.timezone}
                  </p>
                  <p className="text-xs">
                    Next: {format(schedule.nextRunAt, schedule.timezone)}
                    {schedule.lastRunAt ? ` · Last: ${format(schedule.lastRunAt, schedule.timezone)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => open(schedule)} className="rounded border px-2 py-1 text-xs">
                    {openId === schedule.id ? "Hide history" : "History"}
                  </button>
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => toggle(schedule)} className="rounded border px-2 py-1 text-xs">
                        {schedule.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(schedule.id)}
                        className="rounded border px-2 py-1 text-xs text-red-600"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {confirming === schedule.id ? (
                <div className="mt-2 rounded bg-red-50 p-2 text-xs">
                  <p>Delete “{schedule.title}”? Its past tasks stay in execution history.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => remove(schedule.id)} className="rounded bg-red-600 px-2 py-1 text-white">
                      Yes, delete
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded border px-2 py-1">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {openId === schedule.id ? (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 text-xs font-semibold">Execution history</p>
                  {(history[schedule.id] ?? []).length === 0 ? (
                    <p className="text-xs">No runs yet. The scheduler creates one task per due slot.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {(history[schedule.id] ?? []).map((row) => (
                        <li key={row.id} className="flex flex-wrap justify-between gap-2 text-xs">
                          <span>{row.title}</span>
                          <span>
                            {row.status} · due {format(row.scheduledFor, schedule.timezone)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
