import "server-only";

import type { ExecutionHealth, HealthSignal, SignalStatus } from "./health";

/**
 * Turning health into notifications, without a notification provider.
 *
 * The failure this is built to avoid is not "the alert never fired" but its opposite:
 * a scheduler that is down for an hour sending sixty identical messages, so the owner
 * mutes the channel and the next real outage goes unseen. So the derivation and the
 * deduplication are pure functions over an explicit history, and delivery is somebody
 * else's job. That keeps the whole thing testable with a clock and an array.
 *
 * Nothing here sends anything, and nothing here needs a paid service. Wiring a
 * channel is a separate, reversible decision.
 */

export type AlertSeverity = "critical" | "warning";

export type AlertCode =
  | "scheduler_never_ran"
  | "scheduler_stalled"
  | "scheduler_failed"
  | "lease_expired"
  | "queue_backlog"
  | "failure_burst"
  | "approvals_waiting";

export type Alert = {
  code: AlertCode;
  severity: AlertSeverity;
  title: string;
  detail: string;
};

export type AlertRecord = {
  code: AlertCode;
  severity: AlertSeverity;
  notifiedAt: string;
};

export type NotificationPlan = {
  notify: Alert[];
  resolved: AlertCode[];
  suppressed: Alert[];
};

/** A warning waits this long before repeating; a critical one is louder but still bounded. */
export const COOLDOWN_MS: Record<AlertSeverity, number> = {
  warning: 6 * 60 * 60 * 1000,
  critical: 60 * 60 * 1000,
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { warning: 1, critical: 2 };

function byName(health: ExecutionHealth, name: string): HealthSignal | undefined {
  return health.signals.find((signal) => signal.name === name);
}

/**
 * Derives alerts from a health verdict. A signal marked "unknown" produces nothing:
 * an absence of evidence is not an outage, and inventing one teaches the reader to
 * ignore the channel.
 */
export function deriveAlerts(health: ExecutionHealth): Alert[] {
  const alerts: Alert[] = [];

  const scheduler = byName(health, "scheduler");
  if (scheduler) {
    if (/no scheduler pass/.test(scheduler.detail)) {
      alerts.push({
        code: "scheduler_never_ran",
        severity: "critical",
        title: "Scheduler has never run",
        detail: "No pass is recorded, so queued work cannot be dispatched at all.",
      });
    } else if (scheduler.status === "critical") {
      const failed = /last pass failed/.test(scheduler.detail);
      alerts.push({
        code: failed ? "scheduler_failed" : "scheduler_stalled",
        severity: "critical",
        title: failed ? "Scheduler's last pass failed" : "Scheduler has stopped running",
        detail: scheduler.detail,
      });
    }
  }

  const leases = byName(health, "leases");
  if (leases?.status === "critical") {
    alerts.push({
      code: "lease_expired",
      severity: "critical",
      title: "Worker lease expired",
      detail: leases.detail,
    });
  }

  const queue = byName(health, "queue");
  if (queue && queue.status !== "ok" && queue.status !== "unknown") {
    alerts.push({
      code: "queue_backlog",
      severity: queue.status === "critical" ? "critical" : "warning",
      title: "Queue is backing up",
      detail: queue.detail,
    });
  }

  const failures = byName(health, "failures");
  if (failures && failures.status === "critical") {
    alerts.push({
      code: "failure_burst",
      severity: "critical",
      title: "Executions are failing repeatedly",
      detail: failures.detail,
    });
  }

  const approvals = byName(health, "approvals");
  if (approvals) {
    alerts.push({
      code: "approvals_waiting",
      severity: "warning",
      title: "Work is waiting on a decision",
      detail: approvals.detail,
    });
  }

  return alerts;
}

/**
 * Decides what is worth sending now.
 *
 * - a new code is always sent
 * - a repeat is silent until its cooldown has passed
 * - an escalation (warning to critical) is sent immediately, because it means the
 *   situation got worse and the previous message no longer describes it
 * - a code that was open and is no longer present is reported as resolved, once,
 *   so silence does not leave the reader wondering
 */
export function planNotifications(
  previous: AlertRecord[],
  current: Alert[],
  now: Date = new Date()
): NotificationPlan {
  const lastByCode = new Map<AlertCode, AlertRecord>();
  for (const record of previous) {
    const existing = lastByCode.get(record.code);
    if (!existing || new Date(record.notifiedAt) > new Date(existing.notifiedAt)) {
      lastByCode.set(record.code, record);
    }
  }

  const notify: Alert[] = [];
  const suppressed: Alert[] = [];

  for (const alert of current) {
    const last = lastByCode.get(alert.code);
    if (!last) {
      notify.push(alert);
      continue;
    }
    const escalated = SEVERITY_RANK[alert.severity] > SEVERITY_RANK[last.severity];
    const elapsed = now.getTime() - new Date(last.notifiedAt).getTime();
    if (escalated || elapsed >= COOLDOWN_MS[alert.severity]) {
      notify.push(alert);
    } else {
      suppressed.push(alert);
    }
  }

  const currentCodes = new Set(current.map((alert) => alert.code));
  const resolved = [...lastByCode.keys()].filter((code) => !currentCodes.has(code));

  return { notify, resolved, suppressed };
}

/** The history after a send, so the next call can deduplicate against it. */
export function recordNotifications(previous: AlertRecord[], sent: Alert[], now: Date = new Date()): AlertRecord[] {
  const stamp = now.toISOString();
  const next = previous.filter((record) => !sent.some((alert) => alert.code === record.code));
  return [...next, ...sent.map((alert) => ({ code: alert.code, severity: alert.severity, notifiedAt: stamp }))];
}

/** Severity used by a caller that only has room for one line. */
export function overallSeverity(health: ExecutionHealth): SignalStatus {
  return health.verdict;
}
