import { describe, expect, it } from "vitest";
import { buildJourneyReport } from "@/lib/growth/journey-report";

describe("journey report", () => {
  it("orders the four steps and computes step-to-step shares", () => {
    const report = buildJourneyReport(30, {
      demoVisitors: 200,
      demoMessages: 640,
      signups: 40,
      connected: 10,
      succeeded: 6,
    });
    expect(report.steps.map((s) => s.key)).toEqual([
      "demo",
      "signup",
      "connection",
      "success",
    ]);
    expect(report.steps.map((s) => s.fromPrevious)).toEqual([null, 0.2, 0.25, 0.6]);
    expect(report.demoMessages).toBe(640);
  });

  it("names the biggest drop only among the account steps", () => {
    const report = buildJourneyReport(30, {
      demoVisitors: 1000,
      demoMessages: 2000,
      signups: 10,
      connected: 2,
      succeeded: 2,
    });
    // demo->signup is 1%, but it is not a tracked conversion
    expect(report.biggestDrop).toBe("connection");
  });

  it("keeps unknown steps null instead of zero", () => {
    const report = buildJourneyReport(30, {
      demoVisitors: null,
      demoMessages: null,
      signups: 5,
      connected: 0,
      succeeded: 0,
    });
    expect(report.steps[0].count).toBeNull();
    expect(report.steps[1].fromPrevious).toBeNull();
    expect(report.steps[3].fromPrevious).toBeNull();
    expect(report.biggestDrop).toBe("connection");
  });

  it("reports no drop when nothing is lost or nothing is known", () => {
    const report = buildJourneyReport(7, {
      demoVisitors: 3,
      demoMessages: 3,
      signups: 2,
      connected: 2,
      succeeded: 2,
    });
    expect(report.biggestDrop).toBeNull();
    expect(report.notes.length).toBeGreaterThan(0);
  });
});
