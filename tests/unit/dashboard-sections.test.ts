import { expect, test, vi } from "vitest";

import {
  integrationLabel,
  relativeTime,
  section,
  summarizeAgents,
  summarizeIntegrations,
  summarizeSchedules,
} from "@/lib/dashboard/sections";

test("a failing data source becomes an explicit unavailable section, never fake data", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(await section(async () => [1, 2])).toEqual({ ok: true, data: [1, 2] });
  expect(
    await section(async () => {
      throw new Error("db down");
    })
  ).toEqual({ ok: false });
  errors.mockRestore();
});

test("agent summary counts only active agents as active", () => {
  const rows = [
    { id: "a", displayName: "Content", role: "writer", status: "active", lastSeenAt: null },
    { id: "b", displayName: "Research", role: "analyst", status: "paused", lastSeenAt: null },
    { id: "c", displayName: "Support", role: "support", status: "active", lastSeenAt: null },
  ];
  const summary = summarizeAgents(rows, 2);
  expect(summary.total).toBe(3);
  expect(summary.active).toBe(2);
  expect(summary.top.map((agent) => agent.id)).toEqual(["a", "b"]);
});

test("upcoming automations are enabled ones, soonest first", () => {
  const soon = new Date("2026-01-01T10:00:00Z");
  const later = new Date("2026-01-02T10:00:00Z");
  const summary = summarizeSchedules([
    { id: "1", title: "later", enabled: true, nextRunAt: later },
    { id: "2", title: "off", enabled: false, nextRunAt: soon },
    { id: "3", title: "soon", enabled: true, nextRunAt: soon },
    { id: "4", title: "unscheduled", enabled: true, nextRunAt: null },
  ]);
  expect(summary).toMatchObject({ total: 4, enabled: 3 });
  expect(summary.upcoming.map((row) => row.id)).toEqual(["3", "1"]);
});

test("an integration needing reconnect is not also reported as connected", () => {
  const result = summarizeIntegrations({
    connected: new Set(["gmail", "github"]),
    needsReconnect: new Set(["gmail", "google_drive"]),
  });
  expect(result.connected).toEqual(["github", "gmail"]);
  expect(result.needsReconnect).toEqual(["google_drive"]);
  expect(integrationLabel("google_calendar", "ar")).toBe("تقويم Google");
  expect(integrationLabel("unknown_provider", "en")).toBe("unknown_provider");
});

test("relative time reads naturally in Arabic and English", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  expect(relativeTime(new Date(now - 5 * 60_000), "ar", now)).toBe("منذ 5 دقيقة");
  expect(relativeTime(new Date(now - 3 * 3_600_000), "en", now)).toBe("3h ago");
  expect(relativeTime(new Date(now + 2 * 86_400_000), "ar", now)).toBe("بعد 2 يوم");
  expect(relativeTime(null, "ar", now)).toBe("لم يُسجَّل");
  expect(relativeTime(new Date(now), "en", now)).toBe("just now");
});
