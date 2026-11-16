import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { COOLDOWN_MS, deriveAlerts, planNotifications, recordNotifications } from "@/lib/agents/alerts";
import type { Alert, AlertRecord } from "@/lib/agents/alerts";
import type { ExecutionHealth, HealthSignal } from "@/lib/agents/health";

/**
 * Alerting is judged by what it does *not* send.
 *
 * A monitor that reports the same outage every minute is worse than none, because the
 * reader stops reading. Every case below is about restraint that still lets a real
 * escalation through.
 */

const signal = (name: string, status: HealthSignal["status"], detail: string): HealthSignal => ({
  name,
  status,
  detail,
});

function health(signals: HealthSignal[], verdict: ExecutionHealth["verdict"] = "ok"): ExecutionHealth {
  return {
    verdict,
    generatedAt: new Date().toISOString(),
    signals,
    counts: { pending: 0, running: 0, failedLastHour: 0, stuckLeases: 0, approvalsWaiting: 0 },
  };
}

const CRITICAL_SCHEDULER = health([
  signal("scheduler", "critical", "last pass 4h ago (succeeded)"),
  signal("leases", "ok", "none"),
  signal("queue", "ok", "nothing is waiting"),
  signal("failures", "ok", "none"),
], "critical");

const HEALTHY = health([
  signal("scheduler", "ok", "last pass 2m ago (succeeded)"),
  signal("leases", "ok", "none"),
  signal("queue", "ok", "nothing is waiting"),
  signal("failures", "ok", "none"),
]);

describe("deriving alerts from health", () => {
  test("a healthy verdict produces nothing at all", () => {
    assert.deepEqual(deriveAlerts(HEALTHY), []);
  });

  test("a stalled scheduler is critical, and never-run is distinguished from it", () => {
    const stalled = deriveAlerts(CRITICAL_SCHEDULER);
    assert.equal(stalled.length, 1);
    assert.equal(stalled[0].code, "scheduler_stalled");

    const never = deriveAlerts(
      health([signal("scheduler", "warn", "no scheduler pass has been recorded, so nothing can be dispatched")], "warn")
    );
    assert.equal(never[0].code, "scheduler_never_ran");
    assert.equal(never[0].severity, "critical");
  });

  test("a failed pass is reported as a failure, not as silence", () => {
    const alerts = deriveAlerts(
      health([signal("scheduler", "critical", "last pass failed 5m ago: timeout")], "critical")
    );
    assert.equal(alerts[0].code, "scheduler_failed");
  });

  test("an unknown signal invents no outage", () => {
    assert.deepEqual(deriveAlerts(health([signal("leases", "unknown", "")], "unknown")), []);
  });

  test("a backlog warns before it escalates", () => {
    const warn = deriveAlerts(health([signal("queue", "warn", "3 waiting, oldest 45m")], "warn"));
    const crit = deriveAlerts(health([signal("queue", "critical", "9 waiting, oldest 3h")], "critical"));
    assert.equal(warn[0].severity, "warning");
    assert.equal(crit[0].severity, "critical");
  });
});

describe("deciding what to send", () => {
  const now = new Date("2026-11-16T05:00:00Z");
  const alert: Alert = { code: "scheduler_stalled", severity: "critical", title: "t", detail: "d" };
  const recent: AlertRecord = { code: "scheduler_stalled", severity: "critical", notifiedAt: "2026-11-16T04:30:00Z" };

  test("a new alert is sent immediately", () => {
    const plan = planNotifications([], [alert], now);
    assert.equal(plan.notify.length, 1);
    assert.deepEqual(plan.resolved, []);
  });

  test("the same alert inside its cooldown is suppressed, not repeated", () => {
    const plan = planNotifications([recent], [alert], now);
    assert.equal(plan.notify.length, 0);
    assert.equal(plan.suppressed.length, 1);
  });

  test("the same alert after its cooldown is sent again", () => {
    const later = new Date(now.getTime() + COOLDOWN_MS.critical + 1000);
    const plan = planNotifications([recent], [alert], later);
    assert.equal(plan.notify.length, 1);
  });

  test("a warning that becomes critical is sent at once, even inside the cooldown", () => {
    const previous: AlertRecord = { code: "queue_backlog", severity: "warning", notifiedAt: "2026-11-16T04:55:00Z" };
    const escalated: Alert = { code: "queue_backlog", severity: "critical", title: "t", detail: "d" };
    const plan = planNotifications([previous], [escalated], now);
    assert.equal(plan.notify.length, 1);
  });

  test("recovery is reported once, so silence is not ambiguous", () => {
    const plan = planNotifications([recent], [], now);
    assert.deepEqual(plan.resolved, ["scheduler_stalled"]);
    assert.equal(plan.notify.length, 0);
  });

  test("history keeps one record per code, so the next run measures from the last send", () => {
    const history = recordNotifications([recent], [{ ...alert, detail: "newer" }], now);
    assert.equal(history.length, 1);
    assert.equal(history[0].notifiedAt, now.toISOString());
  });
});
