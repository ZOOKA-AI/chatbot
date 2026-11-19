import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { describeCron, isValidCron, isValidTimezone, nextRunAfter, wallClock } from "@/lib/agents/cron";

/**
 * Timezone maths is where schedules quietly go wrong: an hour duplicated or skipped once a
 * year, or an offset applied twice. These tests pin the real cases, including the two DST
 * boundaries in a zone that has them.
 */

const HOUR = 3_600_000;

describe("expressions are validated before they are stored", () => {
  test("month names are one-based, weekday names are zero-based", () => {
    // The bug this catches: `jan` resolving to index 0, which is outside the month range,
    // so every named-month expression was rejected as malformed.
    const next = nextRunAfter("0 0 1 jan *", Date.parse("2026-11-16T00:00:00Z"), "UTC");
    assert.equal(next?.toISOString(), "2027-01-01T00:00:00.000Z");
  });

  test("accepts the shapes people actually use", () => {
    for (const expression of [
      "*/5 * * * *",
      "0 9 * * 1",
      "0 0 1 * *",
      "30 6 1,15 * *",
      "0 9-17/2 * * mon-fri",
      "0 0 * jan,jul *",
    ]) {
      assert.equal(isValidCron(expression), true, expression);
    }
  });

  test("refuses malformed expressions rather than guessing", () => {
    for (const expression of [
      "",
      "* * * *",
      "* * * * * *",
      "60 * * * *",
      "* 24 * * *",
      "* * 0 * *",
      "* * * 13 *",
      "*/0 * * * *",
      "5-1 * * * *",
      "abc * * * *",
      "* * * * funday",
      "0 9 L * *",
      "@daily",
    ]) {
      assert.equal(isValidCron(expression), false, JSON.stringify(expression));
    }
  });

  test("a timezone is validated, not assumed", () => {
    assert.equal(isValidTimezone("Asia/Dubai"), true);
    assert.equal(isValidTimezone("UTC"), true);
    assert.equal(isValidTimezone("Mars/Olympus"), false);
  });
});

describe("next run is computed in the named timezone", () => {
  test("09:00 Dubai is 05:00 UTC, and the result is the same instant", () => {
    // 2026-11-16T00:00Z is 04:00 in Dubai, so the next 09:00 local is 05:00Z same day.
    const next = nextRunAfter("0 9 * * *", Date.parse("2026-11-16T00:00:00Z"), "Asia/Dubai");
    assert.equal(next?.toISOString(), "2026-11-16T05:00:00.000Z");
  });

  test("the same expression in UTC lands on a different instant", () => {
    const next = nextRunAfter("0 9 * * *", Date.parse("2026-11-16T00:00:00Z"), "UTC");
    assert.equal(next?.toISOString(), "2026-11-16T09:00:00.000Z");
  });

  test("every five minutes advances by five minutes, not by one", () => {
    const next = nextRunAfter("*/5 * * * *", Date.parse("2026-11-16T10:02:00Z"), "UTC");
    assert.equal(next?.toISOString(), "2026-11-16T10:05:00.000Z");
  });

  test("an expression that already passed today rolls to tomorrow", () => {
    const next = nextRunAfter("0 9 * * *", Date.parse("2026-11-16T10:00:00Z"), "UTC");
    assert.equal(next?.toISOString(), "2026-11-17T09:00:00.000Z");
  });
});

describe("daylight saving is handled in both directions", () => {
  // Europe/London: 2026-03-29 01:00Z springs forward to 02:00 local; 2026-10-25 01:00Z
  // falls back to 01:00 local. Local midnight is unaffected, 01:30 is not.
  test("a local time that does not exist is skipped, not invented", () => {
    const gap = nextRunAfter("30 1 * * *", Date.parse("2026-03-29T00:00:00Z"), "Europe/London");
    // 01:30 does not exist on that date, so the next real occurrence is the following day.
    assert.equal(gap?.toISOString(), "2026-03-30T00:30:00.000Z");
  });

  test("a local time that happens twice resolves to the first occurrence", () => {
    const ambiguous = nextRunAfter("30 1 * * *", Date.parse("2026-10-24T23:00:00Z"), "Europe/London");
    // 01:30 BST is 00:30Z; the GMT repeat at 01:30Z is not chosen.
    assert.equal(ambiguous?.toISOString(), "2026-10-25T00:30:00.000Z");
  });

  test("a fixed-offset zone keeps the same wall clock across the northern switch", () => {
    const before = nextRunAfter("0 9 * * *", Date.parse("2026-03-28T00:00:00Z"), "Asia/Dubai");
    const after = nextRunAfter("0 9 * * *", Date.parse("2026-03-30T00:00:00Z"), "Asia/Dubai");
    assert.equal(before?.toISOString(), "2026-03-28T05:00:00.000Z");
    assert.equal(after?.toISOString(), "2026-03-30T05:00:00.000Z");
  });

  test("the wall clock reads back what the schedule promised", () => {
    const next = nextRunAfter("0 9 * * *", Date.parse("2026-11-16T06:00:00Z"), "Asia/Dubai");
    assert.ok(next);
    const wall = wallClock(next.getTime(), "Asia/Dubai");
    assert.equal(wall.hour, 9);
    assert.equal(wall.minute, 0);
  });
});

describe("day-of-month and day-of-week combine the way cron says", () => {
  test("both restricted means either matches", () => {
    // The 1st of the month OR any Monday. 2026-11-16 is itself a Monday, so from exactly
    // midnight the next match is the following Monday rather than the next day.
    const next = nextRunAfter("0 0 1 * 1", Date.parse("2026-11-16T00:00:00Z"), "UTC");
    assert.equal(next?.toISOString(), "2026-11-23T00:00:00.000Z");

    // From the 30th, the 1st of December wins because it comes before the next Monday.
    const viaDom = nextRunAfter("0 0 1 * 1", Date.parse("2026-11-30T00:00:00Z"), "UTC");
    assert.equal(viaDom?.toISOString(), "2026-12-01T00:00:00.000Z");
  });

  test("an impossible date has no next run, and says so", () => {
    assert.equal(nextRunAfter("0 0 30 2 *", Date.parse("2026-11-16T00:00:00Z"), "UTC"), null);
  });

  test("monthly on the 1st advances a month", () => {
    const next = nextRunAfter("0 9 1 * *", Date.parse("2026-11-16T00:00:00Z"), "Asia/Dubai");
    assert.equal(next?.toISOString(), "2026-12-01T05:00:00.000Z");
  });
});

describe("the description shown in the UI never invents a time", () => {
  test("it renders the configured hours and minutes", () => {
    assert.equal(describeCron("0 9 * * *"), "09:00");
    assert.equal(describeCron("30 6,18 * * *"), "06:30, 18:30");
  });

  test("an invalid expression has no description", () => {
    assert.equal(describeCron("* * * *"), null);
  });
});

test("offsets are not applied twice", () => {
  // A double application would land three or four hours off in Dubai rather than zero.
  const next = nextRunAfter("0 12 * * *", Date.parse("2026-06-01T00:00:00Z"), "Asia/Dubai");
  assert.equal(next?.getTime(), Date.parse("2026-06-01T08:00:00Z"));
  assert.ok(Math.abs((next!.getTime() % HOUR)) === 0);
});
